import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { OrderAnalyticsService } from './order-analytics.service';
import type { OrderAnalyticsInput, OrderAnalyticsResult } from './order-analytics.service';

@Resolver()
export class OrderAnalyticsResolver {
    constructor(private readonly service: OrderAnalyticsService) {}

    @Query()
    @Allow(CustomPermission.ReadAnalytics.Permission)
    orderAnalytics(
        @Ctx() ctx: RequestContext,
        @Args('input') input: OrderAnalyticsInput,
    ): Promise<OrderAnalyticsResult> {
        return this.service.query(ctx, input);
    }
}
