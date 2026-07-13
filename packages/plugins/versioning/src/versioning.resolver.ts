import { Args, Query, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import { Allow, Ctx, RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { EntityVersion } from './entities/entity-version.entity';
import { VersioningService } from './versioning.service';

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
}
