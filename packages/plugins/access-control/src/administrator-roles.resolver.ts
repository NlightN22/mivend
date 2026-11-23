import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Administrator, Allow, Ctx, RequestContext, Role, Transaction } from '@vendure/core';

import { AdministratorRolesService } from './administrator-roles.service';
import { CustomPermission } from './custom-permission';

@Resolver()
export class AdministratorRolesResolver {
    constructor(private administratorRolesService: AdministratorRolesService) {}

    @Query()
    @Allow(CustomPermission.ManageAdministratorLifecycle.Permission)
    async assignableAdministratorRoles(@Ctx() ctx: RequestContext): Promise<Role[]> {
        return this.administratorRolesService.assignableRoles(ctx);
    }

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ManageAdministratorLifecycle.Permission)
    async setAdministratorRoles(
        @Ctx() ctx: RequestContext,
        @Args() args: { administratorId: string; roleIds: string[] },
    ): Promise<Administrator> {
        return this.administratorRolesService.setRoles(ctx, args.administratorId, args.roleIds);
    }
}
