import { Args, Query, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import { Allow, Ctx, PaginatedList, RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { EntityVersion } from './entities/entity-version.entity';
import { VersioningService } from './versioning.service';

interface EntityVersionListOptions {
    take?: number;
    skip?: number;
    action?: string;
    entityName?: string;
    administratorId?: string;
    system?: boolean;
    createdAfter?: string;
}

@Resolver()
export class VersioningResolver {
    constructor(private versioningService: VersioningService) {}

    @Query()
    @Allow(CustomPermission.ReadEntityHistory.Permission)
    async entityVersions(
        @Ctx() ctx: RequestContext,
        @Args() args: { entityName: string; entityId: ID },
    ): Promise<EntityVersion[]> {
        return this.versioningService.findForEntity(ctx, args.entityName, args.entityId);
    }

    // Batch variant — one request for a whole object graph's audit trail (e.g. a Counterparty
    // plus all of its TradingPoints) instead of one `entityVersions` call per ref.
    @Query()
    @Allow(CustomPermission.ReadEntityHistory.Permission)
    async entityVersionsForEntities(
        @Ctx() ctx: RequestContext,
        @Args()
        args: {
            refs: { entityName: string; entityId: ID }[];
            options?: EntityVersionListOptions;
        },
    ): Promise<PaginatedList<EntityVersion>> {
        return this.versioningService.findForEntities(ctx, args.refs, args.options ?? {});
    }
}
