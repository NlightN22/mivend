import { Args, Query, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import { Allow, Ctx, PaginatedList, RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { EntityVersion } from './entities/entity-version.entity';
import { EntityVersionScopeRegistry } from './entity-version-scope.registry';
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
    constructor(
        private versioningService: VersioningService,
        private scopeRegistry: EntityVersionScopeRegistry,
    ) {}

    @Query()
    @Allow(CustomPermission.ReadEntityHistory.Permission)
    async entityVersions(
        @Ctx() ctx: RequestContext,
        @Args() args: { entityName: string; entityId: ID },
    ): Promise<EntityVersion[]> {
        const allowed = await this.scopeRegistry.filterRefs(ctx, [args]);
        if (allowed.length === 0) return [];
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
        const refs = await this.scopeRegistry.filterRefs(ctx, args.refs);
        return this.versioningService.findForEntities(ctx, refs, args.options ?? {});
    }
}
