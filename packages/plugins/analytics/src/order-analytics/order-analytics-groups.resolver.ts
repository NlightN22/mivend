import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { GROUP_KINDS } from './order-analytics-group-filters';
import type { GroupFilterKind } from './order-analytics-group-filters';
import { OrderAnalyticsGroupsService } from './order-analytics-groups.service';
import type { GroupOption } from './order-analytics-groups.service';

@Resolver()
export class OrderAnalyticsGroupsResolver {
    constructor(private readonly groups: OrderAnalyticsGroupsService) {}

    @Query()
    @Allow(CustomPermission.ReadAnalytics.Permission)
    analyticsFilterCapabilities(): { groupKinds: GroupFilterKind[] } {
        return { groupKinds: [...GROUP_KINDS] };
    }

    @Query()
    @Allow(CustomPermission.ReadAnalytics.Permission)
    async orderAnalyticsGroupSuggest(
        @Ctx() ctx: RequestContext,
        @Args('kind') kind: GroupFilterKind,
        @Args('prefix') prefix: string,
    ): Promise<GroupOption[]> {
        return this.groups.suggest(ctx, kind, prefix);
    }
}
