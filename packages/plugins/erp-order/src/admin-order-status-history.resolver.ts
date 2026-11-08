import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Ctx, Order, RequestContext } from '@vendure/core';

import { OrderStatusHistoryEntry } from './entities/order-status-history-entry.entity';
import { OrderStatusHistoryService } from './order-status-history.service';

// Staff see every status the order passed, customer-visible or not; reachable only through an order the caller may read.
@Resolver('Order')
export class AdminOrderStatusHistoryResolver {
    constructor(private history: OrderStatusHistoryService) {}

    @ResolveField()
    statusHistory(
        @Ctx() ctx: RequestContext,
        @Parent() order: Order,
    ): Promise<OrderStatusHistoryEntry[]> {
        return this.history.list(ctx, order.id);
    }
}
