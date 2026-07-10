import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Order, PaginatedList, Permission, RequestContext } from '@vendure/core';
import { OrderListOptions } from '@vendure/common/lib/generated-types';

import { OrderVisibilityService } from './order-visibility.service';

@Resolver()
export class AdminOrderVisibilityResolver {
    constructor(private orderVisibilityService: OrderVisibilityService) {}

    // Scoped equivalent of Vendure's built-in `orders` query for the manager portal (see
    // docs/ai/manager-portal-pages/02-orders-list.md) — the built-in `orders` query returns
    // every order in the company regardless of caller role, which is not safe to expose there.
    @Query()
    @Allow(Permission.ReadOrder)
    async visibleOrders(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: OrderListOptions; managerId?: string; customerId?: string },
    ): Promise<PaginatedList<Order>> {
        return this.orderVisibilityService.findVisible(
            ctx,
            args.options,
            args.managerId,
            args.customerId,
        );
    }
}
