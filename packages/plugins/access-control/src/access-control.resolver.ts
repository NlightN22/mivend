import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Permission } from '@vendure/common/lib/generated-types';
import { Allow, AdministratorService, Ctx, RequestContext, Transaction } from '@vendure/core';

import { CustomPermission } from './custom-permission';
import { AccessScopeService } from './access-scope.service';
import { BranchService } from './branch.service';
import { CreditTermLimitService } from './credit-term-limit.service';
import { DepartmentService } from './department.service';
import { Branch } from './entities/branch.entity';
import { CreditTermLimit } from './entities/credit-term-limit.entity';
import { Department } from './entities/department.entity';
import { AccessScopeConfig, RoleScopeConfigService } from './role-scope-config.service';

interface TeamMember {
    id: string;
    firstName: string;
    lastName: string;
    emailAddress: string;
    roleCodes: string[];
}

interface TeamDirectoryMember {
    id: string;
    firstName: string | null;
    lastName: string | null;
    roleCodes: string[];
    departmentId: string | null;
    branchId: string | null;
    position: string | null;
}

@Resolver()
export class AccessControlResolver {
    constructor(
        private roleScopeConfigService: RoleScopeConfigService,
        private departmentService: DepartmentService,
        private branchService: BranchService,
        private creditTermLimitService: CreditTermLimitService,
        private administratorService: AdministratorService,
        private accessScopeService: AccessScopeService,
    ) {}

    // Names + role codes only — used to label the "Manager" filter/column on the Orders and
    // Customers lists (see docs/ai/manager-portal-pages/02-orders-list.md,
    // 04-customers-list.md) and to populate the "Escalate to..." picker on the approval detail
    // page (see 11-approval-detail.md). These are all picker/assignment use cases where the
    // caller already has (or is choosing) a working relationship with the named administrator
    // — real names are required for the picker to be usable, so this query is deliberately NOT
    // subject to the teamVisibility anonymization that `teamDirectory` below applies. No
    // dedicated permission — view-only org-structure data, same as `departments` below; role
    // codes are already shown everywhere as badges, not sensitive.
    @Query()
    @Allow(Permission.Authenticated)
    async teamMembers(@Ctx() ctx: RequestContext): Promise<TeamMember[]> {
        const result = await this.administratorService.findAll(ctx, { take: 200 }, ['user.roles']);
        return result.items.map(a => ({
            id: String(a.id),
            firstName: a.firstName,
            lastName: a.lastName,
            emailAddress: a.emailAddress,
            roleCodes: a.user?.roles?.map(r => r.code) ?? [],
        }));
    }

    // Powers the /team org-structure directory (docs/ai/manager-portal-pages/13-team.md) only
    // — unlike `teamMembers` above, `firstName`/`lastName` are anonymized to null for members
    // outside the caller's own department when the caller's 'teamVisibility' access scope isn't
    // 'all' (see AccessScopeService.resolveTeamVisibilityScope). This is the one field pair on
    // this query that IS sensitive (an employee not wanting to be identified by name
    // company-wide) — kept as a separate query from `teamMembers` so picker/assignment call
    // sites (Orders/Customers manager filter, approval escalation) always get real names
    // regardless of the viewer's teamVisibility scope.
    @Query()
    @Allow(Permission.Authenticated)
    async teamDirectory(@Ctx() ctx: RequestContext): Promise<TeamDirectoryMember[]> {
        const result = await this.administratorService.findAll(ctx, { take: 200 }, ['user.roles']);
        const [ownDepartmentId, visibilityScope] = await Promise.all([
            this.accessScopeService.getOwnDepartmentId(ctx),
            this.accessScopeService.resolveTeamVisibilityScope(ctx),
        ]);
        return result.items.map(a => {
            const customFields = a.customFields as
                | {
                      departmentId?: string | null;
                      branchId?: string | null;
                      position?: string | null;
                  }
                | undefined;
            const departmentId = customFields?.departmentId ?? null;
            const sameDepartment = ownDepartmentId != null && departmentId === ownDepartmentId;
            const nameVisible = visibilityScope.kind === 'all' || sameDepartment;
            return {
                id: String(a.id),
                firstName: nameVisible ? a.firstName : null,
                lastName: nameVisible ? a.lastName : null,
                roleCodes: a.user?.roles?.map(r => r.code) ?? [],
                departmentId,
                branchId: customFields?.branchId ?? null,
                position: customFields?.position ?? null,
            };
        });
    }

    // Org structure is ERP master data, view-only in the portal for every authenticated
    // administrator — no dedicated permission, per manager-portal-concept.md §3.3 "/team".
    @Query()
    @Allow(Permission.Authenticated)
    async departments(@Ctx() ctx: RequestContext): Promise<Department[]> {
        return this.departmentService.findAll(ctx);
    }

    // Same visibility rule as `departments` above.
    @Query()
    @Allow(Permission.Authenticated)
    async branches(@Ctx() ctx: RequestContext): Promise<Branch[]> {
        return this.branchService.findAll(ctx);
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
    async roleAccessScopeConfig(
        @Ctx() ctx: RequestContext,
        @Args() args: { roleCode: string },
    ): Promise<string | null> {
        const config = await this.roleScopeConfigService.getScopeFor(ctx, args.roleCode);
        return config ? JSON.stringify(config) : null;
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
