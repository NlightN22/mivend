import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, RequestContext, Transaction } from '@vendure/core';

import { CustomPermission } from './custom-permission';
import {
    DepartmentBranchMappingService,
    DepartmentBranchNode,
} from './department-branch-mapping.service';

@Resolver()
export class DepartmentBranchResolver {
    constructor(private mappingService: DepartmentBranchMappingService) {}

    @Query()
    @Allow(CustomPermission.ManageAccessControl.Permission)
    async departmentBranchOverview(@Ctx() ctx: RequestContext): Promise<DepartmentBranchNode[]> {
        return this.mappingService.overview(ctx);
    }

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ManageAccessControl.Permission)
    async setDepartmentBranch(
        @Ctx() ctx: RequestContext,
        @Args() args: { departmentErpId: string; branchId: string },
    ): Promise<boolean> {
        await this.mappingService.set(ctx, args.departmentErpId, args.branchId);
        return true;
    }

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ManageAccessControl.Permission)
    async clearDepartmentBranch(
        @Ctx() ctx: RequestContext,
        @Args() args: { departmentErpId: string },
    ): Promise<boolean> {
        await this.mappingService.clear(ctx, args.departmentErpId);
        return true;
    }
}
