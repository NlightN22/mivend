import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { suggestEntityNames } from './order-analytics-entity-filters';
import { OrderAnalyticsEntityNamesService } from './order-analytics-entity-names.service';
import type { EntityFilterKind } from './order-analytics-entity-names.service';
import { OrderAnalyticsService } from './order-analytics.service';
import type { OrderAnalyticsInput, OrderAnalyticsResult } from './order-analytics.service';

@Resolver()
export class OrderAnalyticsResolver {
    constructor(
        private readonly service: OrderAnalyticsService,
        private readonly entityNames: OrderAnalyticsEntityNamesService,
    ) {}

    @Query()
    @Allow(CustomPermission.ReadAnalytics.Permission)
    orderAnalytics(
        @Ctx() ctx: RequestContext,
        @Args('input') input: OrderAnalyticsInput,
    ): Promise<OrderAnalyticsResult> {
        return this.service.query(ctx, input);
    }

    @Query()
    @Allow(CustomPermission.ReadAnalytics.Permission)
    orderAnalyticsSuggest(
        @Ctx() ctx: RequestContext,
        @Args('kind') kind: EntityFilterKind,
        @Args('prefix') prefix: string,
    ): Promise<string[]> {
        return suggestEntityNames(ctx, this.entityNames, kind, prefix);
    }
}
