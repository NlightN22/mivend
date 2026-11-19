import { Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';

import type { AnalyticsReport } from './analytics-report';
import { reportsFor } from './analytics-reports';
import { ANALYTICS_REPORTS } from './definitions';

// Each report carries its own permission, filtered here rather than by @Allow.
@Resolver()
export class AnalyticsResolver {
    @Query()
    @Allow(Permission.Authenticated)
    analyticsReports(@Ctx() ctx: RequestContext): Array<Omit<AnalyticsReport, 'permission'>> {
        return reportsFor(ANALYTICS_REPORTS, p => ctx.userHasPermissions([p as Permission])).map(
            r => ({
                key: r.key,
                title: r.title,
                description: r.description,
                area: r.area,
                status: r.status,
                note: r.note,
            }),
        );
    }
}
