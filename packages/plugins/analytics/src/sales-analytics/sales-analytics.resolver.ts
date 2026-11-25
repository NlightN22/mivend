import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { SalesAnalyticsService } from './sales-analytics.service';
import type { SalesAnalyticsInput, SalesAnalyticsResult } from './sales-analytics.service';

@Resolver()
export class SalesAnalyticsResolver {
    constructor(private readonly service: SalesAnalyticsService) {}

    @Query()
    @Allow(CustomPermission.ReadAnalytics.Permission)
    salesAnalytics(
        @Ctx() ctx: RequestContext,
        @Args('input') input: SalesAnalyticsInput,
    ): Promise<SalesAnalyticsResult> {
        return this.service.query(ctx, input);
    }
}
