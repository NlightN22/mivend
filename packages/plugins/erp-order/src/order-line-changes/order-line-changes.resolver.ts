import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Order, Permission, RequestContext } from '@vendure/core';

import { OrderLineChangesService } from './order-line-changes.service';
import type { OrderLineChange } from './line-change.types';

// Fields of Order: reachable only through an order the caller already may read; the customer gets no money.
@Resolver('Order')
export class ShopOrderLineChangesResolver {
    constructor(private readonly service: OrderLineChangesService) {}

    @ResolveField()
    async lineChanges(
        @Ctx() ctx: RequestContext,
        @Parent() order: Order,
    ): Promise<OrderLineChange[]> {
        return (await this.service.forOrder(ctx, order, 'customer')).lines;
    }
}

@Resolver('Order')
export class AdminOrderLineChangesResolver {
    constructor(private readonly service: OrderLineChangesService) {}

    @ResolveField()
    @Allow(Permission.ReadOrder)
    async lineChanges(
        @Ctx() ctx: RequestContext,
        @Parent() order: Order,
    ): Promise<OrderLineChange[]> {
        return (await this.service.forOrder(ctx, order, 'staff')).lines;
    }

    @ResolveField()
    @Allow(Permission.ReadOrder)
    async soldTotalWithTax(
        @Ctx() ctx: RequestContext,
        @Parent() order: Order,
    ): Promise<number | null> {
        const { lines, amountDeltaMinor } = await this.service.forOrder(ctx, order, 'staff');
        if (lines.length === 0 && amountDeltaMinor === 0) return null;
        return Math.max(0, order.totalWithTax + amountDeltaMinor);
    }
}
