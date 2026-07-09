import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Permission } from '@vendure/common/lib/generated-types';
import { Allow, AdministratorService, Ctx, RequestContext, Transaction } from '@vendure/core';

import { CustomPermission } from './custom-permission';
import { CreditTermLimitService } from './credit-term-limit.service';
import { DepartmentService } from './department.service';
import { CreditTermLimit } from './entities/credit-term-limit.entity';
import { Department } from './entities/department.entity';
import { AccessScopeConfig, RoleScopeConfigService } from './role-scope-config.service';

interface TeamMember {
    id: string;
    firstName: string;
    lastName: string;
}

@Resolver()
export class AccessControlResolver {
    constructor(
        private roleScopeConfigService: RoleScopeConfigService,
        private departmentService: DepartmentService,
        private creditTermLimitService: CreditTermLimitService,
        private administratorService: AdministratorService,
    ) {}

    // Names only (no email/roles/customFields) — used to label the "Manager" filter/column on
    // the manager portal's Orders list (see docs/ai/manager-portal-pages/02-orders-list.md).
    // Same visibility rule as `departments` below: view-only org-structure data, no dedicated
    // permission, safe for any authenticated portal user since it carries nothing sensitive.
    @Query()
    @Allow(Permission.Authenticated)
    async teamMembers(@Ctx() ctx: RequestContext): Promise<TeamMember[]> {
        const result = await this.administratorService.findAll(ctx, { take: 200 });
        return result.items.map(a => ({
            id: String(a.id),
            firstName: a.firstName,
            lastName: a.lastName,
        }));
    }

    // Org structure is ERP master data, view-only in the portal for every authenticated
    // administrator — no dedicated permission, per manager-portal-concept.md §3.3 "/team".
    @Query()
    @Allow(Permission.Authenticated)
    async departments(@Ctx() ctx: RequestContext): Promise<Department[]> {
        return this.departmentService.findAll(ctx);
    }

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ManageAccessControl.Permission)
    async setRoleAccessScopeConfig(
        @Ctx() ctx: RequestContext,
        @Args() args: { roleCode: string; accessScopeConfig: string },
    ): Promise<boolean> {
        const config = JSON.parse(args.accessScopeConfig) as AccessScopeConfig;
        await this.roleScopeConfigService.setScopeFor(ctx, args.roleCode, config);
        return true;
    }

    @Query()
    @Allow(CustomPermission.ManageAccessControl.Permission)
    async creditTermLimit(
        @Ctx() ctx: RequestContext,
        @Args() args: { roleCode: string },
    ): Promise<CreditTermLimit | null> {
        return this.creditTermLimitService.getLimit(ctx, args.roleCode);
    }

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ManageAccessControl.Permission)
    async setCreditTermLimit(
        @Ctx() ctx: RequestContext,
        @Args() args: { roleCode: string; maxExtraDays: number; maxAmount?: number },
    ): Promise<CreditTermLimit> {
        return this.creditTermLimitService.setLimit(
            ctx,
            args.roleCode,
            args.maxExtraDays,
            args.maxAmount ?? null,
        );
    }
}
