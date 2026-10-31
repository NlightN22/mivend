import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, PaginatedList, RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { ConsistencyReport } from './consistency-report.entity';
import { ConsistencyReportService } from './consistency-report.service';
import type {
    ConsistencyReportListOptions,
    ConsistencySourceView,
} from './consistency-report.service';

// Read-only health view: same permission as the other integration health queries, no write path.
@Resolver()
export class ConsistencyReportResolver {
    constructor(private readonly service: ConsistencyReportService) {}

    @Query()
    @Allow(CustomPermission.ManageErpIntegration.Permission)
    consistencyReports(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: ConsistencyReportListOptions },
    ): Promise<PaginatedList<ConsistencyReport>> {
        return this.service.list(ctx, args.options);
    }

    @Query()
    @Allow(CustomPermission.ManageErpIntegration.Permission)
    consistencySources(@Ctx() ctx: RequestContext): Promise<ConsistencySourceView[]> {
        return this.service.sources(ctx);
    }
}
