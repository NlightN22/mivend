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
import { PositionService } from './position.service';
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
    positionId: string | null;
    position: string | null;
}

@Resolver()
export class AccessControlResolver {
    constructor(
        private roleScopeConfigService: RoleScopeConfigService,
        private departmentService: DepartmentService,
        private positionService: PositionService,
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

    // Not subject to teamVisibility anonymization: pickers need real names to be usable.
    // View-only org-structure data, so no dedicated permission (like departments).
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

    // firstName/lastName are anonymized outside the caller's department unless teamVisibility is 'all'.
    // Separate from teamMembers so picker call sites always get real names.
    @Query()
    @Allow(Permission.Authenticated)
    async teamDirectory(@Ctx() ctx: RequestContext): Promise<TeamDirectoryMember[]> {
        const result = await this.administratorService.findAll(ctx, { take: 200 }, ['user.roles']);
        const [ownDepartmentId, visibilityScope] = await Promise.all([
            this.accessScopeService.getOwnDepartmentId(ctx),
            this.accessScopeService.resolveTeamVisibilityScope(ctx),
        ]);
        const positionNames = await this.positionService.findNamesByErpIds(
            ctx,
            result.items.flatMap(a => {
                const id = (a.customFields as { positionId?: string | null } | undefined)
                    ?.positionId;
                return id ? [id] : [];
            }),
        );
        return result.items.map(a => {
            const customFields = a.customFields as
                | {
                      departmentId?: string | null;
                      branchId?: string | null;
                      positionId?: string | null;
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
                positionId: customFields?.positionId ?? null,
                position: positionNames.get(customFields?.positionId ?? '') ?? null,
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

    // Blocks warehouse ingestion system-wide if misused, so SuperAdmin only.
    // Exposed only in the native Dashboard, never the manager portal.
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
            packagesOnly?: boolean;
            enforceMultiplicity?: boolean;
            allowExceedingCreditLimit?: boolean;
            prepaymentReserveDays?: number;
            proformaPaymentTermDays?: number;
        },
    ): Promise<BranchSettings> {
        return this.branchSettingsService.upsert(ctx, {
            branchId: args.branchId,
            defaultPriceTypeId: args.defaultPriceTypeId,
            visiblePriceTypeIds: args.visiblePriceTypeIds ?? null,
            defaultWarehouseId: args.defaultWarehouseId,
            visibleWarehouseIds: args.visibleWarehouseIds ?? null,
            packagesOnly: args.packagesOnly,
            enforceMultiplicity: args.enforceMultiplicity,
            allowExceedingCreditLimit: args.allowExceedingCreditLimit,
            prepaymentReserveDays: args.prepaymentReserveDays,
            proformaPaymentTermDays: args.proformaPaymentTermDays,
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

    // Issue #134 Part 2 — same gate as roleAccessScopeConfig/setRoleAccessScopeConfig above
    // (this is the same Settings > Roles & Access surface's own health signal).
    @Query()
    @Allow(CustomPermission.ManageAccessControl.Permission)
    async roleAccessScopeProvisioningStatus(
        @Ctx() ctx: RequestContext,
    ): Promise<Array<{ roleCode: string; missing: boolean }>> {
        return this.roleScopeConfigService.getProvisioningStatus(ctx);
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

    // Issue #119: unlinked ERP users awaiting a human decision — see ErpUser's own comment.
    @Query()
    @Allow(CustomPermission.ManageAdministratorLifecycle.Permission)
    async pendingErpUsers(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: ListQueryOptions<ErpUser> },
    ): Promise<PaginatedList<ErpUser>> {
        return this.erpUserService.findAllPaginated(ctx, args.options);
    }

    // Soft-deleted: hidden from the native administrators query, so not a filter on it.
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

    // Issue #119, Decision 2: manual override on top of the automatic ERP-driven sync in
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

    // Public: the caller has no session yet, so the token is the only security boundary.
    // Must be valid, unexpired and single-use.
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

    // Public because the caller has no session; read-only, so it does not consume the token.
    @Query()
    @Allow(Permission.Public)
    async administratorForPasswordResetToken(
        @Ctx() ctx: RequestContext,
        @Args() args: { token: string },
    ): Promise<{ firstName: string; lastName: string; emailAddress: string } | null> {
        return this.administratorProvisioningService.findAdministratorByResetToken(ctx, args.token);
    }
}

// isActive is not a native Administrator GraphQL field; Vendure exposes only deletedAt.
// Resolved from the already-loaded entity, not a second query.
@Resolver('Administrator')
export class AdministratorStatusResolver {
    @ResolveField()
    isActive(@Parent() administrator: Administrator): boolean {
        return administrator.deletedAt == null;
    }
}
