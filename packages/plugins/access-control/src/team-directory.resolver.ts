import { Args, Query, Resolver } from '@nestjs/graphql';
import { Permission } from '@vendure/common/lib/generated-types';
import { Allow, Ctx, PaginatedList, RequestContext } from '@vendure/core';

import {
    TeamDirectoryListOptions,
    TeamDirectoryMember,
    TeamDirectoryService,
} from './team-directory.service';

@Resolver()
export class TeamDirectoryResolver {
    constructor(private teamDirectoryService: TeamDirectoryService) {}

    // Org-structure view for every authenticated administrator; separate from teamMembers, which
    // keeps real names for pickers and filters.
    @Query()
    @Allow(Permission.Authenticated)
    async teamDirectory(
        @Ctx() ctx: RequestContext,
        @Args('options') options?: TeamDirectoryListOptions,
    ): Promise<PaginatedList<TeamDirectoryMember>> {
        return this.teamDirectoryService.findPage(ctx, options ?? {});
    }
}
