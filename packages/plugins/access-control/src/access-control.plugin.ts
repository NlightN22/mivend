import {
    LanguageCode,
    PluginCommonModule,
    RuntimeVendureConfig,
    VendurePlugin,
} from '@vendure/core';
import { CustomerPricingPlugin } from '@mivend/plugin-customer-pricing';
import gql from 'graphql-tag';

import { AccessControlResolver, AdministratorStatusResolver } from './access-control.resolver';
import { AccessScopeService } from './access-scope.service';
import { TeamAdministratorService } from './team-administrator.service';
import { AdministratorActivationService } from './administrator-activation.service';
import { AdministratorProvisioningService } from './administrator-provisioning.service';
import { BranchService } from './branch.service';
import { DefaultBranchBootstrapService } from './default-branch-bootstrap.service';
import { DefaultChannelCurrencyBootstrapService } from './default-channel-currency-bootstrap.service';
import { BranchSettingsService } from './branch-settings.service';
import { CreditTermLimitService } from './credit-term-limit.service';
import { DepartmentService } from './department.service';
import { EmployeeService } from './employee.service';
import { ErpUserResolver } from './erp-user.resolver';
import { ErpUserService } from './erp-user.service';
import { UserEnrichmentService } from './user-enrichment.service';
import { Branch } from './entities/branch.entity';
import { BranchSettings } from './entities/branch-settings.entity';
import { CreditTermLimit } from './entities/credit-term-limit.entity';
import { Department } from './entities/department.entity';
import { ErpPosition } from './entities/erp-position.entity';
import { PositionService } from './position.service';
import { ErpUser } from './entities/erp-user.entity';
import { RoleAccessScope } from './entities/role-access-scope.entity';
import { RoleProvisioningService } from './role-provisioning.service';
import { RoleScopeConfigService } from './role-scope-config.service';
import { ACCESS_CONTROL_PLUGIN_OPTIONS, AccessControlPluginOptions } from './types';
import { Warehouse } from './entities/warehouse.entity';
import { WarehouseService } from './warehouse.service';

const adminApiSchema = gql`
    type ErpPosition {
        id: ID!
        erpId: String!
        name: String!
        parentErpId: String
        isActive: Boolean!
    }

    type Department {
        id: ID!
        erpId: String!
        name: String!
        parentErpId: String
    }

    type Branch {
        id: ID!
        erpId: String!
        name: String!
    }

    type Warehouse {
        id: ID!
        erpId: String!
        name: String!
        # Nullable (issue #80 follow-up) — a Warehouse always exists even when its ERP-reported
        # branch never resolved; staff assign one manually via updateWarehouseBranchAssignment.
        branchId: String
        isActive: Boolean!
        includedInBranchAtp: Boolean!
    }

    type BranchSettings {
        id: ID!
        branchId: String!
        defaultPriceTypeId: String!
        visiblePriceTypeIds: [String!]
        defaultWarehouseId: String
        visibleWarehouseIds: [String!]
        packagesOnly: Boolean!
        prepaymentReserveDays: Int!
        proformaPaymentTermDays: Int!
    }

    type TeamMember {
        id: ID!
        firstName: String!
        lastName: String!
        emailAddress: String!
        roleCodes: [String!]!
    }

    type TeamDirectoryMember {
        id: ID!
        firstName: String
        lastName: String
        roleCodes: [String!]!
        departmentId: String
        branchId: String
        positionId: String
        position: String
    }

    type CreditTermLimit {
        roleCode: String!
        maxExtraDays: Int!
        maxAmount: Int
    }

    # Issue #134 Part 2 — defense in depth for RoleProvisioningService's bootstrap-time
    # self-provisioning. "missing" also covers a drifted (not just absent) scope config — see
    # RoleScopeConfigService.getProvisioningStatus.
    type RoleAccessScopeProvisioningStatusItem {
        roleCode: String!
        missing: Boolean!
    }

    # implements Node/PaginatedList — not just server-side convention (backend-plugin-rules
    # skill's own "generateListOptions auto-detects PaginatedList" mechanism, confirmed safe
    # here since it only ever merges into an existing same-named ListOptions/appends an options
    # arg when no arg of that type already exists, never duplicates). Also required client-side:
    # @vendure/dashboard's ListPage/useGeneratedColumns silently produces zero auto-generated
    # columns for a list item type that doesn't implement these — confirmed live (issue #119
    # Phase 1's own "Pending ERP users" page rendered only its one additionalColumn until this
    # was added), unlike deactivatedAdministrators, which reuses the native, already-compliant
    # Administrator/AdministratorList.
    # Renamed from PendingErpUser (mivend.audit.common, 2026-09-20) — "pending" stopped
    # describing the row once linked ones stick around too (ErpUser.status/administratorId are
    # never deleted on link, see ErpUser entity's own doc comment). The pendingErpUsers query
    # name is kept as-is — it still means exactly what it says (only unlinked rows), see
    # ErpUserService.findAllPaginated's own filter.
    type ErpUser implements Node {
        id: ID!
        erpId: String!
        fullName: String
        email: String
        departmentId: String
        positionErpId: String
        position: String
        firstSeenAt: DateTime!
        lastSeenAt: DateTime!
        status: String!
        administratorId: ID
    }

    type ErpUserList implements PaginatedList {
        items: [ErpUser!]!
        totalItems: Int!
    }

    input ErpUserFilterParameter {
        erpId: StringOperators
        positionErpId: StringOperators
        fullName: StringOperators
        email: StringOperators
    }

    input ErpUserSortParameter {
        erpId: SortOrder
        fullName: SortOrder
        email: SortOrder
        firstSeenAt: SortOrder
        lastSeenAt: SortOrder
    }

    input ErpUserListOptions {
        skip: Int
        take: Int
        sort: ErpUserSortParameter
        filter: ErpUserFilterParameter
        filterOperator: LogicalOperator
    }

    enum PortalUserStatus {
        active
        inactive
    }

    # Issue #119 Phase 2: not a native Administrator field — Vendure core tracks deletedAt
    # internally but never exposes it on the GraphQL type. Resolved by AdministratorStatusResolver
    # in access-control.resolver.ts from the same entity instance already loaded by whichever
    # query returned this Administrator.
    extend type Administrator {
        isActive: Boolean!
    }

    type ResetAdministratorPasswordResult {
        success: Boolean!
        reason: String
    }

    type PasswordResetIdentity {
        firstName: String!
        lastName: String!
        emailAddress: String!
    }

    extend type Query {
        departments: [Department!]!
        positions: [ErpPosition!]!
        branches: [Branch!]!
        warehouses: [Warehouse!]!
        branchSettings(branchId: String!): BranchSettings
        teamMembers: [TeamMember!]!
        teamDirectory: [TeamDirectoryMember!]!
        creditTermLimit(roleCode: String!): CreditTermLimit
        roleAccessScopeConfig(roleCode: String!): String
        roleAccessScopeProvisioningStatus: [RoleAccessScopeProvisioningStatusItem!]!
        # Issue #119 Phase 1: both real server-side pagination, backing the Dashboard "ERP
        # users" screens' ListPage components — see access-control.resolver.ts's own comments.
        pendingErpUsers(options: ErpUserListOptions): ErpUserList!
        deactivatedAdministrators(options: AdministratorListOptions): AdministratorList!
        # Issue #119 Phase 2: backs the manager-portal Settings > Users screen — every
        # Administrator, filterable by status (omit status for "All").
        portalUsers(options: AdministratorListOptions, status: PortalUserStatus): AdministratorList!
        # Issue #119 Phase 2: lets /set-password show whose account it's about to change — public,
        # same reasoning as resetAdministratorPassword's own schema comment below.
        administratorForPasswordResetToken(token: String!): PasswordResetIdentity
    }

    extend type Mutation {
        setRoleAccessScopeConfig(roleCode: String!, accessScopeConfig: String!): Boolean!
        setCreditTermLimit(roleCode: String!, maxExtraDays: Int!, maxAmount: Int): CreditTermLimit!
        # Issue #119 Phase 2: completes the emailed password-reset link — deliberately no
        # @Allow(Public) alternative on the *schema* side, that's a resolver-level concern, but
        # this mutation is reachable with no session (see the resolver's own comment).
        resetAdministratorPassword(
            token: String!
            password: String!
        ): ResetAdministratorPasswordResult!
        updateWarehouseBranchAssignment(
            warehouseId: ID!
            branchId: String!
            includedInBranchAtp: Boolean!
        ): Warehouse!
        setBranchSettings(
            branchId: String!
            defaultPriceTypeId: String!
            visiblePriceTypeIds: [String!]
            defaultWarehouseId: String!
            visibleWarehouseIds: [String!]
            packagesOnly: Boolean
            prepaymentReserveDays: Int
            proformaPaymentTermDays: Int
        ): BranchSettings!
        createBranch(name: String!): Branch!
        createAdministratorFromErpUser(erpId: String!): Administrator!
        resendAdministratorPasswordReset(administratorId: ID!): Boolean!
        setAdministratorActive(administratorId: ID!, isActive: Boolean!): Boolean!
    }
`;

@VendurePlugin({
    imports: [PluginCommonModule, CustomerPricingPlugin],
    entities: [
        RoleAccessScope,
        Department,
        ErpPosition,
        Branch,
        Warehouse,
        BranchSettings,
        CreditTermLimit,
        ErpUser,
    ],
    providers: [
        AccessScopeService,
        TeamAdministratorService,
        RoleScopeConfigService,
        DepartmentService,
        PositionService,
        BranchService,
        WarehouseService,
        BranchSettingsService,
        EmployeeService,
        CreditTermLimitService,
        UserEnrichmentService,
        ErpUserService,
        AdministratorActivationService,
        AdministratorProvisioningService,
        RoleProvisioningService,
        DefaultBranchBootstrapService,
        DefaultChannelCurrencyBootstrapService,
        {
            provide: ACCESS_CONTROL_PLUGIN_OPTIONS,
            useFactory: (): AccessControlPluginOptions => AccessControlPlugin.options,
        },
    ],
    exports: [
        AccessScopeService,
        TeamAdministratorService,
        RoleScopeConfigService,
        DepartmentService,
        PositionService,
        BranchService,
        WarehouseService,
        BranchSettingsService,
        EmployeeService,
        CreditTermLimitService,
        UserEnrichmentService,
        ErpUserService,
        AdministratorActivationService,
        AdministratorProvisioningService,
    ],
    adminApiExtensions: {
        schema: adminApiSchema,
        resolvers: [AccessControlResolver, AdministratorStatusResolver, ErpUserResolver],
    },
    configuration: (config: RuntimeVendureConfig) => {
        // System-managed: hand edits break the correlation/sync that owns each field.
        // readonly only filters the GraphQL input; direct AdministratorService.update/create() bypasses it.
        config.customFields.Administrator = [
            ...(config.customFields.Administrator ?? []),
            {
                // Informational only; must never gate visibility (see docs/access-control.md).
                name: 'departmentId',
                type: 'string' as const,
                nullable: true,
                readonly: true,
                label: [{ languageCode: LanguageCode.en, value: 'Department ID' }],
            },
            {
                // Resolved from the ERP department id to a Branch.id; the real access-scope filter axis.
                name: 'branchId',
                type: 'string' as const,
                nullable: true,
                readonly: true,
                label: [{ languageCode: LanguageCode.en, value: 'Branch ID' }],
            },
            {
                // Owned by @mivend/plugin-sync; declared here so it can be read without a package dependency.
                // Branch-only: correlates the replica with its Central record; always null on Central.
                name: 'sourceAdministratorId',
                type: 'string' as const,
                nullable: true,
                readonly: true,
                label: [{ languageCode: LanguageCode.en, value: 'Source Administrator ID' }],
            },
            {
                // Anchored once at creation, never re-derived or hand-edited; erpId is the identity, not email.
                // unique: true is a real DB-level constraint (CustomFieldConfig), not just an app-level check.
                name: 'erpId',
                type: 'string' as const,
                nullable: true,
                unique: true,
                readonly: true,
                label: [{ languageCode: LanguageCode.en, value: 'ERP User ID' }],
            },
        ];
        config.customFields.GlobalSettings = [
            ...(config.customFields.GlobalSettings ?? []),
            {
                // Fallback for managers/counterparties with no branchId or no BranchSettings configured yet.
                // Deliberately a bare id, not a copied settings blob, so settings have one source of truth.
                name: 'defaultBranchId',
                type: 'string' as const,
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Default Branch ID' }],
            },
        ];
        return config;
    },
    compatibility: '>0.0.0',
})
export class AccessControlPlugin {
    static options: AccessControlPluginOptions = {};

    static init(options: AccessControlPluginOptions): typeof AccessControlPlugin {
        this.options = options;
        return this;
    }
}
