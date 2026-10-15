import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import {
    EventBus,
    ID,
    Logger,
    Order,
    OrderLine,
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

// Must stay non-blocking: a blocking handler nests in the mutation's transaction
// and corrupts price resolution.
@Injectable()
export class TierRebalanceService implements OnApplicationBootstrap {
    private running = new Map<string, { dirtyLineId: ID | null }>();
    // Set synchronously by a blocking handler (marker only, no order mutation) so reads see it.
    private markers = new Map<string, Marker>();
    // Events seen by the blocking handler whose post-commit subscriber has not started yet.
    private pending = new Map<string, number>();
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
                    const key = String(event.order.id);
                    this.pending.set(key, (this.pending.get(key) ?? 0) + 1);
                    this.mark(key);
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
        this.pending.set(key, Math.max(0, (this.pending.get(key) ?? 0) - 1));
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
                const passError = await this.rebalancePass(ownCtx, orderId, lineId);
                await this.refreshTotals(ownCtx, orderId);
                if (passError !== undefined) throw passError;
                lineId = state.dirtyLineId;
            }
        } finally {
            const key = String(orderId);
            this.running.delete(key);
            if (!this.pending.get(key)) this.unmark(key);
        }
    }

    private async rebalancePass(
        ctx: RequestContext,
        orderId: ID,
        changedLineId: ID,
    ): Promise<unknown> {
        const freshOrder = await this.connection.getRepository(ctx, Order).findOne({
            where: { id: orderId },
            relations: ['lines'],
        });
        if (!freshOrder) return undefined;
        let firstError: unknown;
        for (const { id: lineId } of freshOrder.lines) {
            if (String(lineId) === String(changedLineId)) continue;
            try {
                // Quantity is re-read under the order lock: the snapshot above may predate a concurrent change.
                await this.connection.withTransaction(ctx, async txCtx => {
                    this.ownContexts.add(txCtx);
                    await this.lockOrder(txCtx, orderId);
                    const line = await this.connection
                        .getRepository(txCtx, OrderLine)
                        .findOne({ where: { id: lineId } });
                    if (!line) return;
                    await this.orderService.adjustOrderLine(txCtx, orderId, line.id, line.quantity);
                });
            } catch (error) {
                Logger.error(
                    `Rebalance of line ${String(lineId)} in order ${String(orderId)} failed: ${String(error)}`,
                    loggerCtx,
                );
                firstError ??= error;
            }
        }
        return firstError;
    }

    // Row lock first: a concurrent mutation's commit must be visible before totals are recomputed,
    // otherwise a stale snapshot overwrites its correct total (lost update).
    private async refreshTotals(ctx: RequestContext, orderId: ID): Promise<void> {
        await this.connection.withTransaction(ctx, async txCtx => {
            await this.lockOrder(txCtx, orderId);
            const order = await this.orderService.findOne(txCtx, orderId, [
                'lines',
                'lines.productVariant',
                'shippingLines',
                'surcharges',
            ]);
            if (order) await this.orderService.applyPriceAdjustments(txCtx, order, []);
        });
    }

    private async lockOrder(txCtx: RequestContext, orderId: ID): Promise<void> {
        await this.connection
            .getRepository(txCtx, Order)
            .createQueryBuilder('o')
            .setLock('pessimistic_write')
            .where('o.id = :id', { id: orderId })
            .select('o.id')
            .getOne();
    }
}
