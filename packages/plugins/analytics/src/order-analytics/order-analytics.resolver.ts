import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { suggestEntityNames } from './order-analytics-entity-filters';
import { OrderAnalyticsEntityNamesService } from './order-analytics-entity-names.service';
import type { EntityFilterKind } from './order-analytics-entity-names.service';
import { OrderAnalyticsFilterValuesService } from './order-analytics-filter-values.service';
import type { OrderAnalyticsFilterValuesResult } from './order-analytics-filter-values.service';
import type { OrderFilterKind } from './order-metrics.types';
import { OrderAnalyticsService } from './order-analytics.service';
import type { OrderAnalyticsInput, OrderAnalyticsResult } from './order-analytics.service';

@Resolver()
export class OrderAnalyticsResolver {
    constructor(
        private readonly service: OrderAnalyticsService,
        private readonly entityNames: OrderAnalyticsEntityNamesService,
        private readonly filterValues: OrderAnalyticsFilterValuesService,
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

    @Query()
    @Allow(CustomPermission.ReadAnalytics.Permission)
    orderAnalyticsFilterValues(
        @Args('kind') kind: OrderFilterKind,
        @Args('from') from?: Date | null,
        @Args('to') to?: Date | null,
    ): Promise<OrderAnalyticsFilterValuesResult> {
        return this.filterValues.list(kind, from, to);
    }
}
