import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Order, PaginatedList, Permission, RequestContext } from '@vendure/core';
import { OrderListOptions } from '@vendure/common/lib/generated-types';

import { OrderVisibilityService } from './order-visibility.service';

@Resolver()
export class AdminOrderVisibilityResolver {
    constructor(private orderVisibilityService: OrderVisibilityService) {}

    // Built-in Vendure `orders` query returns all company orders regardless of caller role;
    // not safe to expose in the manager portal, so this scoped query replaces it.
    @Query()
    @Allow(Permission.ReadOrder)
    async visibleOrders(
        @Ctx() ctx: RequestContext,
        @Args()
        args: {
            options?: OrderListOptions;
            managerId?: string;
            customerId?: string;
            search?: string;
        },
    ): Promise<PaginatedList<Order>> {
        return this.orderVisibilityService.findVisible(
            ctx,
            args.options,
            args.managerId,
            args.customerId,
            args.search,
        );
    }
}
