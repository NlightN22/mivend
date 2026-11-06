import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import { OrderListOptions } from '@vendure/common/lib/generated-types';

import {
    CounterpartyLastOrder,
    OrderVisibilityAggregatesService,
} from './order-visibility-aggregates.service';

@Resolver()
export class OrderVisibilityAggregatesResolver {
    constructor(private aggregates: OrderVisibilityAggregatesService) {}

    @Query()
    @Allow(Permission.ReadOrder)
    async visibleOrdersAmount(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: OrderListOptions },
    ): Promise<number> {
        return this.aggregates.sumVisibleTotals(ctx, args.options);
    }

    @Query()
    @Allow(Permission.ReadOrder)
    async lastOrderDates(
        @Ctx() ctx: RequestContext,
        @Args() args: { counterpartyIds: string[] },
    ): Promise<CounterpartyLastOrder[]> {
        return this.aggregates.lastOrderDates(ctx, args.counterpartyIds);
    }
}
