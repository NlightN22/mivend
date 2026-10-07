import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import {
    EventBus,
    ID,
    Order,
    OrderLineEvent,
    OrderService,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { subscribeAndLog } from 'shared';

const loggerCtx = 'TierRebalanceService';

const MAX_PASSES = 4;
const MARKER_TTL_MS = 10_000;

interface Marker {
    settled: Promise<void>;
    release: () => void;
}

/**
 * Re-runs sibling lines' price calculation after a line mutation so shared tier/brand
 * ladders stay consistent. Non-blocking on purpose: a blocking handler nests in the
 * mutation's transaction and corrupts price resolution; details in docs/pricing.md.
 */
@Injectable()
export class TierRebalanceService implements OnApplicationBootstrap {
    private running = new Map<string, { dirtyLineId: ID | null }>();
    // Set synchronously by a blocking handler (marker only, no order mutation) so reads see it.
    private markers = new Map<string, Marker>();
    // Contexts used by our own adjustOrderLine calls, so their events do not retrigger us.
    private ownContexts = new WeakSet<RequestContext>();

    constructor(
        private eventBus: EventBus,
        private orderService: OrderService,
        private connection: TransactionalConnection,
    ) {}

    onApplicationBootstrap(): void {
        this.eventBus.registerBlockingEventHandler({
            event: OrderLineEvent,
            id: 'tier-rebalance-marker',
            handler: async event => {
                if (event.type !== 'cancelled' && !this.ownContexts.has(event.ctx)) {
                    this.mark(String(event.order.id));
                }
            },
        });
        subscribeAndLog(
            this.eventBus,
            OrderLineEvent,
            async event => {
                if (event.type === 'cancelled' || this.ownContexts.has(event.ctx)) return;
                await this.rebalanceSiblingLines(event.ctx, event.order, event.orderLine.id);
            },
            loggerCtx,
        );
    }

    async waitForSettled(orderId: ID, timeoutMs: number): Promise<void> {
        const marker = this.markers.get(String(orderId));
        if (!marker) return;
        let timer: NodeJS.Timeout | undefined;
        const timeout = new Promise<void>(resolve => {
            timer = setTimeout(resolve, timeoutMs);
        });
        await Promise.race([marker.settled, timeout]);
        clearTimeout(timer);
    }

    private mark(key: string): void {
        if (this.markers.has(key)) return;
        let release!: () => void;
        const settled = new Promise<void>(resolve => (release = resolve));
        const timer = setTimeout(() => this.unmark(key), MARKER_TTL_MS);
        timer.unref();
        this.markers.set(key, {
            settled,
            release: () => {
                clearTimeout(timer);
                release();
            },
        });
    }

    private unmark(key: string): void {
        this.markers.get(key)?.release();
        this.markers.delete(key);
    }

    private async rebalanceSiblingLines(
        ctx: RequestContext,
        order: Order,
        changedLineId: ID,
    ): Promise<void> {
        const key = String(order.id);
        this.mark(key);
        const active = this.running.get(key);
        if (active) {
            active.dirtyLineId = changedLineId;
            return;
        }
        const state: { dirtyLineId: ID | null } = { dirtyLineId: null };
        this.running.set(key, state);
        await this.runPasses(ctx, order.id, changedLineId, state);
    }

    private async runPasses(
        ctx: RequestContext,
        orderId: ID,
        firstLineId: ID,
        state: { dirtyLineId: ID | null },
    ): Promise<void> {
        const ownCtx = ctx.copy();
        this.ownContexts.add(ownCtx);
        try {
            let lineId: ID | null = firstLineId;
            for (let pass = 0; lineId !== null && pass < MAX_PASSES; pass++) {
                state.dirtyLineId = null;
                await this.rebalancePass(ownCtx, orderId, lineId);
                await this.refreshTotals(ownCtx, orderId);
                lineId = state.dirtyLineId;
            }
        } finally {
            this.running.delete(String(orderId));
            this.unmark(String(orderId));
        }
    }

    private async rebalancePass(
        ctx: RequestContext,
        orderId: ID,
        changedLineId: ID,
    ): Promise<void> {
        const freshOrder = await this.connection.getRepository(ctx, Order).findOne({
            where: { id: orderId },
            relations: ['lines'],
        });
        if (!freshOrder) return;
        for (const line of freshOrder.lines) {
            if (String(line.id) === String(changedLineId)) continue;
            // Same quantity: only forces calculateUnitPrice() against the current aggregate.
            await this.orderService.adjustOrderLine(ctx, orderId, line.id, line.quantity);
        }
    }

    private async refreshTotals(ctx: RequestContext, orderId: ID): Promise<void> {
        const order = await this.orderService.findOne(ctx, orderId, [
            'lines',
            'lines.productVariant',
            'shippingLines',
        ]);
        if (order) await this.orderService.applyPriceAdjustments(ctx, order, []);
    }
}
