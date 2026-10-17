import { Args, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import type { OrderListOptions } from '@vendure/common/lib/generated-types';
import {
    Allow,
    Ctx,
    Customer,
    EntityNotFoundError,
    Order,
    OrderLine,
    OrderService,
    PaginatedList,
    Permission,
    Relations,
    RelationPaths,
    RequestContext,
} from '@vendure/core';

import { OrderVisibilityService } from '../order-visibility.service';
import { bypassesScope } from './core-order-scope.interceptor';
import { OrderTargetService } from './order-target.service';

// Overrides core's `orders` (same field name): the list is the caller's visible orders.
@Resolver()
export class ScopedOrdersResolver {
    constructor(
        private visibility: OrderVisibilityService,
        private orderService: OrderService,
    ) {}

    @Query()
    @Allow(Permission.ReadOrder)
    async orders(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: OrderListOptions },
        @Relations(Order) relations: RelationPaths<Order>,
    ): Promise<PaginatedList<Order>> {
        if (bypassesScope(ctx)) return this.orderService.findAll(ctx, args.options, relations);
        return this.visibility.findVisible(
            ctx,
            args.options,
            undefined,
            undefined,
            undefined,
            relations as string[],
        );
    }
}

// Overrides core's Customer.orders in the Admin API with the same scope.
@Resolver('Customer')
export class ScopedCustomerOrdersResolver {
    constructor(
        private visibility: OrderVisibilityService,
        private orderService: OrderService,
    ) {}

    @ResolveField()
    async orders(
        @Ctx() ctx: RequestContext,
        @Parent() customer: Customer,
        @Args() args: { options?: OrderListOptions },
        @Relations(Order) relations: RelationPaths<Order>,
    ): Promise<PaginatedList<Order>> {
        if (bypassesScope(ctx)) {
            return this.orderService.findByCustomerId(ctx, customer.id, args.options, relations);
        }
        return this.visibility.findVisible(
            ctx,
            args.options,
            undefined,
            String(customer.id),
            undefined,
            relations as string[],
        );
    }
}

// Overrides core's OrderLine.order in the Admin API: stock movements reach order lines unscoped.
@Resolver('OrderLine')
export class ScopedOrderLineOrderResolver {
    constructor(
        private visibility: OrderVisibilityService,
        private orderService: OrderService,
    ) {}

    @ResolveField()
    async order(
        @Ctx() ctx: RequestContext,
        @Parent() line: OrderLine,
        @Relations(Order) relations: RelationPaths<Order>,
    ): Promise<Order | undefined> {
        const order = await this.orderService.findOneByOrderLineId(ctx, line.id, relations);
        if (!order || bypassesScope(ctx)) return order;
        const visible = await this.visibility.visibleIds(ctx, [order.id]);
        if (!visible.has(String(order.id))) throw new EntityNotFoundError('Order', order.id);
        return order;
    }
}

// Core 3.7.3 never loads a stock movement's orderLine (the field errors); scoped in case it does.
abstract class ScopedStockMovementOrderLine {
    constructor(
        private visibility: OrderVisibilityService,
        private targets: OrderTargetService,
    ) {}

    async scopedOrderLine(
        ctx: RequestContext,
        movement: { orderLine?: OrderLine },
    ): Promise<OrderLine | undefined> {
        const line = movement.orderLine;
        if (!line || bypassesScope(ctx)) return line;
        const owners = await this.targets.owners(ctx, 'orderLine', [line.id]);
        const orderId = owners.get(String(line.id))?.[0];
        const visible = orderId ? await this.visibility.visibleIds(ctx, [orderId]) : new Set();
        if (!orderId || !visible.has(orderId)) throw new EntityNotFoundError('OrderLine', line.id);
        return line;
    }
}

@Resolver('Allocation')
export class ScopedAllocationOrderLineResolver extends ScopedStockMovementOrderLine {
    constructor(visibility: OrderVisibilityService, targets: OrderTargetService) {
        super(visibility, targets);
    }

    @ResolveField()
    orderLine(
        @Ctx() ctx: RequestContext,
        @Parent() movement: { orderLine?: OrderLine },
    ): Promise<OrderLine | undefined> {
        return this.scopedOrderLine(ctx, movement);
    }
}

@Resolver('Cancellation')
export class ScopedCancellationOrderLineResolver extends ScopedStockMovementOrderLine {
    constructor(visibility: OrderVisibilityService, targets: OrderTargetService) {
        super(visibility, targets);
    }

    @ResolveField()
    orderLine(
        @Ctx() ctx: RequestContext,
        @Parent() movement: { orderLine?: OrderLine },
    ): Promise<OrderLine | undefined> {
        return this.scopedOrderLine(ctx, movement);
    }
}
