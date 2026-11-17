import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Order, Permission, RequestContext } from '@vendure/core';

import { OrderLineChangesService } from './order-line-changes.service';
import type { OrderChanges, OrderLineChange } from './line-change.types';

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

// The Order object lives for one request, so both fields of one order share a single computation.
@Resolver('Order')
export class AdminOrderLineChangesResolver {
    private readonly computed = new WeakMap<object, Promise<OrderChanges>>();

    constructor(private readonly service: OrderLineChangesService) {}

    private staffChanges(ctx: RequestContext, order: Order): Promise<OrderChanges> {
        let pending = this.computed.get(order);
        if (!pending) {
            pending = this.service.forOrder(ctx, order, 'staff');
            this.computed.set(order, pending);
        }
        return pending;
    }

    @ResolveField()
    @Allow(Permission.ReadOrder)
    async lineChanges(
        @Ctx() ctx: RequestContext,
        @Parent() order: Order,
    ): Promise<OrderLineChange[]> {
        return (await this.staffChanges(ctx, order)).lines;
    }

    @ResolveField()
    @Allow(Permission.ReadOrder)
    async soldTotalWithTax(
        @Ctx() ctx: RequestContext,
        @Parent() order: Order,
    ): Promise<number | null> {
        const { lines, amountDeltaMinor } = await this.staffChanges(ctx, order);
        if (lines.length === 0 && amountDeltaMinor === 0) return null;
        return Math.max(0, order.totalWithTax + amountDeltaMinor);
    }
}
