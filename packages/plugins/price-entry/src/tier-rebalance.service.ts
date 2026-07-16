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

/**
 * Vendure only recalls `CustomerPriceCalculationStrategy.calculateUnitPrice()` for the
 * OrderLine that was actually added/adjusted/deleted — sibling lines sharing the same
 * facet (and therefore the same weight/amount tier ladder) keep their unitPrice cached
 * from whenever *they* were last touched. Without this, two lines of the same brand can
 * show inconsistent discounts depending purely on which line the last mutation touched —
 * this rebalances every other line in the order whenever one line's change could have
 * shifted the shared facet aggregate.
 *
 * Runs as a plain (non-blocking) EventBus subscriber, deliberately *not*
 * `registerBlockingEventHandler` — `ofType()` only delivers the event after the
 * triggering mutation's transaction has committed, so this runs in its own fresh
 * transaction. A blocking handler was tried first and rejected: nesting
 * `OrderService.adjustOrderLine()` calls inside the *same* transaction as the
 * triggering mutation corrupted price resolution for the rest of that transaction
 * (observed both lines falling back to undiscounted listPrice) — not worth the
 * same-response consistency it would have bought. The tradeoff here is that the
 * rebalanced price lands a beat after the mutation's own GraphQL response, visible on
 * the next `activeOrder` read (e.g. the storefront's post-mutation `fetchCart()`).
 */
@Injectable()
export class TierRebalanceService implements OnApplicationBootstrap {
    // Guards against the OrderLineEvent each adjustOrderLine() call below fires back
    // into this same subscriber — without it, rebalancing line B would trigger a
    // rebalance of line A, which would trigger a rebalance of line B, forever.
    private rebalancingOrders = new Set<string>();

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
                if (event.type === 'cancelled') return;
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
        if (this.rebalancingOrders.has(key)) return;
        this.rebalancingOrders.add(key);
        try {
            const freshOrder = await this.connection.getRepository(ctx, Order).findOne({
                where: { id: order.id },
                relations: ['lines'],
            });
            if (!freshOrder) return;
            for (const line of freshOrder.lines) {
                if (String(line.id) === String(changedLineId)) continue;
                // Same quantity — the point is only to force calculateUnitPrice() to
                // re-run against the current cross-line aggregate, not to change qty.
                await this.orderService.adjustOrderLine(ctx, order.id, line.id, line.quantity);
            }
        } finally {
            this.rebalancingOrders.delete(key);
        }
    }
}
