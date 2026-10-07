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

/**
 * Re-runs sibling lines' price calculation after a line mutation so shared tier/brand
 * ladders stay consistent. Non-blocking on purpose: a blocking handler nests in the
 * mutation's transaction and corrupts price resolution; details in docs/pricing.md.
 */
@Injectable()
export class TierRebalanceService implements OnApplicationBootstrap {
    private running = new Map<string, { dirtyLineId: ID | null }>();
    // Contexts used by our own adjustOrderLine calls, so their events do not retrigger us.
    private ownContexts = new WeakSet<RequestContext>();

    constructor(
        private eventBus: EventBus,
        private orderService: OrderService,
        private connection: TransactionalConnection,
    ) {}

    onApplicationBootstrap(): void {
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

    private async rebalanceSiblingLines(
        ctx: RequestContext,
        order: Order,
        changedLineId: ID,
    ): Promise<void> {
        const key = String(order.id);
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
                lineId = state.dirtyLineId;
            }
            await this.refreshTotals(ownCtx, orderId);
        } finally {
            this.running.delete(String(orderId));
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
