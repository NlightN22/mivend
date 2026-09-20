import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { AdministratorListOptions, Permission } from '@vendure/common/lib/generated-types';
import {
    Administrator,
    Allow,
    AdministratorService,
    Ctx,
    ListQueryOptions,
    PaginatedList,
    RequestContext,
    Transaction,
} from '@vendure/core';

import { AdministratorActivationService } from './administrator-activation.service';
import { AdministratorProvisioningService } from './administrator-provisioning.service';
import { CustomPermission } from './custom-permission';
import { AccessScopeService } from './access-scope.service';
import { BranchService } from './branch.service';
import { BranchSettingsService } from './branch-settings.service';
import { CreditTermLimitService } from './credit-term-limit.service';
import { DepartmentService } from './department.service';
import { Branch } from './entities/branch.entity';
import { BranchSettings } from './entities/branch-settings.entity';
import { CreditTermLimit } from './entities/credit-term-limit.entity';
import { Department } from './entities/department.entity';
import { ErpUser } from './entities/erp-user.entity';
import { Warehouse } from './entities/warehouse.entity';
import { ErpUserService } from './erp-user.service';
import { AccessScopeConfig, RoleScopeConfigService } from './role-scope-config.service';
import { WarehouseService } from './warehouse.service';

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
        private warehouseService: WarehouseService,
        private branchSettingsService: BranchSettingsService,
        private creditTermLimitService: CreditTermLimitService,
        private administratorService: AdministratorService,
        private accessScopeService: AccessScopeService,
        private erpUserService: ErpUserService,
        private administratorProvisioningService: AdministratorProvisioningService,
        private administratorActivationService: AdministratorActivationService,
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

    // mivend's own branch consolidation, independent of any ERP-provided org unit — see
    // BranchService.createManual's own comment. Deliberately SuperAdmin, NOT the broader
    // ManageAccessControl this file's other mutations use (setCreditTermLimit,
    // setRoleAccessScopeConfig, updateWarehouseBranchAssignment) — those are legitimate
    // day-to-day manager-portal business settings that portal-admin/general-director roles hold;
    // this one is the org-structure precondition that blocks warehouse ingestion for the entire
    // system if misused, so it's restricted to a real superadmin and only ever exposed through
    // the native Dashboard (src/dashboard/branch-consolidation/branches-page.tsx), never the
    // manager portal.
    @Transaction()
    @Mutation()
    @Allow(Permission.SuperAdmin)
    async createBranch(
        @Ctx() ctx: RequestContext,
        @Args() args: { name: string },
    ): Promise<Branch> {
        return this.branchService.createManual(ctx, args.name);
    }

    // Curation source list for the Warehouse↔Branch admin surface (issue #66) — view-only for
    // any authenticated administrator, same as departments/branches above.
    @Query()
    @Allow(Permission.Authenticated)
    async warehouses(@Ctx() ctx: RequestContext): Promise<Warehouse[]> {
        return this.warehouseService.findAll(ctx);
    }

    @Query()
    @Allow(Permission.Authenticated)
    async branchSettings(
        @Ctx() ctx: RequestContext,
        @Args() args: { branchId: string },
    ): Promise<BranchSettings | null> {
        return this.branchSettingsService.getForBranch(ctx, args.branchId);
    }

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ManageAccessControl.Permission)
    async updateWarehouseBranchAssignment(
        @Ctx() ctx: RequestContext,
        @Args() args: { warehouseId: string; branchId: string; includedInBranchAtp: boolean },
    ): Promise<Warehouse> {
        return this.warehouseService.setBranchAssignment(
            ctx,
            args.warehouseId,
            args.branchId,
            args.includedInBranchAtp,
        );
    }

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ManageAccessControl.Permission)
    async setBranchSettings(
        @Ctx() ctx: RequestContext,
        @Args()
        args: {
            branchId: string;
            defaultPriceTypeId: string;
            visiblePriceTypeIds?: string[];
            defaultWarehouseId: string;
            visibleWarehouseIds?: string[];
        },
    ): Promise<BranchSettings> {
        return this.branchSettingsService.upsert(ctx, {
            branchId: args.branchId,
            defaultPriceTypeId: args.defaultPriceTypeId,
            visiblePriceTypeIds: args.visiblePriceTypeIds ?? null,
            defaultWarehouseId: args.defaultWarehouseId,
            visibleWarehouseIds: args.visibleWarehouseIds ?? null,
        });
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

    // Issue #119: unlinked 1C users awaiting a human decision — see ErpUser's own comment.
    @Query()
    @Allow(CustomPermission.ManageAdministratorLifecycle.Permission)
    async pendingErpUsers(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: ListQueryOptions<ErpUser> },
    ): Promise<PaginatedList<ErpUser>> {
        return this.erpUserService.findAllPaginated(ctx, args.options);
    }

    // Issue #119 Phase 1: soft-deleted (deactivated) Administrators — invisible to the native
    // `administrators` query/page, see AdministratorActivationService.findDeactivated's own
    // comment for why this can't just be a filter on that query.
    @Query()
    @Allow(CustomPermission.ManageAdministratorLifecycle.Permission)
    async deactivatedAdministrators(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: AdministratorListOptions },
    ): Promise<PaginatedList<Administrator>> {
        return this.administratorActivationService.findDeactivated(ctx, args.options);
    }

    // Issue #119, Decision 3: the only Administrator creation path anchored on erpId — zero
    // roles, password set via emailed reset link, never a plaintext password.
    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ManageAdministratorLifecycle.Permission)
    async createAdministratorFromErpUser(
        @Ctx() ctx: RequestContext,
        @Args() args: { erpId: string },
    ): Promise<Administrator> {
        return this.administratorProvisioningService.createFromPending(ctx, args.erpId);
    }

    // Issue #119: no "resend" action existed anywhere — createFromPending only ever sent the
    // link once, at creation time. Reuses the same token/event mechanism for an existing
    // Administrator.
    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ManageAdministratorLifecycle.Permission)
    async resendAdministratorPasswordReset(
        @Ctx() ctx: RequestContext,
        @Args() args: { administratorId: string },
    ): Promise<boolean> {
        await this.administratorProvisioningService.resendPasswordReset(ctx, args.administratorId);
        return true;
    }

    // Issue #119, Decision 2: manual override on top of the automatic 1C-driven sync in
    // UserEnrichmentService/AdministratorActivationService.syncFromErp.
    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ManageAdministratorLifecycle.Permission)
    async setAdministratorActive(
        @Ctx() ctx: RequestContext,
        @Args() args: { administratorId: string; isActive: boolean },
    ): Promise<boolean> {
        await this.administratorActivationService.setActive(
            ctx,
            args.administratorId,
            args.isActive,
        );
        return true;
    }

    // Issue #119 Phase 2: backs the manager-portal Settings > Users screen — every Administrator
    // (not scoped to erpId, unlike Phase 1's deactivatedAdministrators), filterable by status.
    @Query()
    @Allow(CustomPermission.ManageAdministratorLifecycle.Permission)
    async portalUsers(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: AdministratorListOptions; status?: 'active' | 'inactive' },
    ): Promise<PaginatedList<Administrator>> {
        return this.administratorActivationService.findAllWithStatus(
            ctx,
            args.options,
            args.status,
        );
    }

    // Issue #119 Phase 2: completes the emailed password-reset link from
    // AdministratorProvisioningService.createFromPending. Deliberately Public — the person
    // opening this link has no session yet; possession of a valid, unexpired, single-use token
    // is the only security boundary here, same as the shop-api's own public resetPassword.
    @Transaction()
    @Mutation()
    @Allow(Permission.Public)
    async resetAdministratorPassword(
        @Ctx() ctx: RequestContext,
        @Args() args: { token: string; password: string },
    ): Promise<{ success: boolean; reason: string | null }> {
        const result = await this.administratorProvisioningService.completePasswordReset(
            ctx,
            args.token,
            args.password,
        );
        return result.success
            ? { success: true, reason: null }
            : { success: false, reason: result.reason };
    }

    // Issue #119 Phase 2: lets /set-password show whose account it's about to change, before and
    // after submission. Deliberately Public, same reasoning as resetAdministratorPassword above —
    // read-only, does not consume the token.
    @Query()
    @Allow(Permission.Public)
    async administratorForPasswordResetToken(
        @Ctx() ctx: RequestContext,
        @Args() args: { token: string },
    ): Promise<{ firstName: string; lastName: string; emailAddress: string } | null> {
        return this.administratorProvisioningService.findAdministratorByResetToken(ctx, args.token);
    }
}

// Issue #119 Phase 2: `isActive` isn't a native Administrator field (Vendure core exposes only
// `deletedAt` internally, not on the GraphQL type) — resolved here from the same entity instance
// `portalUsers`/`deactivatedAdministrators` already load, not a second query.
@Resolver('Administrator')
export class AdministratorStatusResolver {
    @ResolveField()
    isActive(@Parent() administrator: Administrator): boolean {
        return administrator.deletedAt == null;
    }
}
