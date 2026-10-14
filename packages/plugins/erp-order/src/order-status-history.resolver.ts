import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Ctx, Order, RequestContext } from '@vendure/core';

import { OrderStatusHistoryEntry } from './entities/order-status-history-entry.entity';
import { OrderStatusHistoryService } from './order-status-history.service';

// A field of Order, so it is reachable only through an order the caller already may read.
@Resolver('Order')
export class OrderStatusHistoryResolver {
    constructor(private history: OrderStatusHistoryService) {}

    @ResolveField()
    statusHistory(
        @Ctx() ctx: RequestContext,
        @Parent() order: Order,
    ): Promise<OrderStatusHistoryEntry[]> {
        return this.history.list(ctx, order.id);
    }
}
