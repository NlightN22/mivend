import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Ctx, Order, RequestContext } from '@vendure/core';

import { OrderStatusHistoryEntry } from './entities/order-status-history-entry.entity';
import { OrderStatusHistoryService } from './order-status-history.service';
import { OrderStatusReferenceService } from './order-status-reference.service';

// A field of Order, so it is reachable only through an order the caller already may read.
// Statuses hidden from customers, or missing from the dictionary, are never returned.
@Resolver('Order')
export class OrderStatusHistoryResolver {
    constructor(
        private history: OrderStatusHistoryService,
        private statuses: OrderStatusReferenceService,
    ) {}

    @ResolveField()
    async statusHistory(
        @Ctx() ctx: RequestContext,
        @Parent() order: Order,
    ): Promise<OrderStatusHistoryEntry[]> {
        const [entries, dictionary] = await Promise.all([
            this.history.list(ctx, order.id),
            this.statuses.dictionary(ctx),
        ]);
        return entries.filter(entry => dictionary.get(entry.status)?.customerVisible === true);
    }
}
