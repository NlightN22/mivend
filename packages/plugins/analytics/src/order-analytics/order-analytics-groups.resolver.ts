import { Inject } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { ANALYTICS_PLUGIN_OPTIONS } from '../types';
import type { AnalyticsPluginOptions } from '../types';
import { DEFERRED_GROUP_KINDS, GROUP_KINDS } from './order-analytics-group-filters';
import type { GroupFilterKind } from './order-analytics-group-filters';
import { OrderAnalyticsGroupsService } from './order-analytics-groups.service';
import type { GroupOption } from './order-analytics-groups.service';

@Resolver()
export class OrderAnalyticsGroupsResolver {
    constructor(
        private readonly groups: OrderAnalyticsGroupsService,
        @Inject(ANALYTICS_PLUGIN_OPTIONS) private readonly options: AnalyticsPluginOptions,
    ) {}

    private enabledKinds(): GroupFilterKind[] {
        return GROUP_KINDS.filter(
            kind =>
                !DEFERRED_GROUP_KINDS.includes(kind) ||
                this.options.productCategoryAndCustomerGroupFilters === true,
        );
    }

    @Query()
    @Allow(CustomPermission.ReadAnalytics.Permission)
    analyticsFilterCapabilities(): { groupKinds: GroupFilterKind[] } {
        return { groupKinds: this.enabledKinds() };
    }

    @Query()
    @Allow(CustomPermission.ReadAnalytics.Permission)
    async orderAnalyticsGroupSuggest(
        @Ctx() ctx: RequestContext,
        @Args('kind') kind: GroupFilterKind,
        @Args('prefix') prefix: string,
    ): Promise<GroupOption[]> {
        if (!this.enabledKinds().includes(kind)) return [];
        return this.groups.suggest(ctx, kind, prefix);
    }
}
