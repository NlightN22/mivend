import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, Permission, RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';
import { OrderVisibilityService } from '@mivend/plugin-erp-order';

import type { OrderRetroBonus } from './retro-bonus-line-percent';
import { RetroBonusOrderService } from './retro-bonus-order.service';

@Resolver()
export class RetroBonusOrderResolver {
    constructor(
        private orders: RetroBonusOrderService,
        private visibility: OrderVisibilityService,
    ) {}

    // Same gate as retroBonusRules, plus the order's own visibility.
    @Query()
    @Allow(Permission.ReadCustomer, CustomPermission.ReadCounterparty.Permission)
    async orderRetroBonus(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderId: ID },
    ): Promise<OrderRetroBonus> {
        if (!(await this.visibility.visibleIds(ctx, [args.orderId])).has(String(args.orderId))) {
            return { hasRules: false, lines: [] };
        }
        return this.orders.forOrder(ctx, args.orderId);
    }
}
