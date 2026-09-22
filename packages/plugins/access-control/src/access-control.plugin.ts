import {
    LanguageCode,
    PluginCommonModule,
    RuntimeVendureConfig,
    VendurePlugin,
} from '@vendure/core';
import gql from 'graphql-tag';

import { AccessControlResolver, AdministratorStatusResolver } from './access-control.resolver';
import { AccessScopeService } from './access-scope.service';
import { AdministratorActivationService } from './administrator-activation.service';
import { AdministratorProvisioningService } from './administrator-provisioning.service';
import { BranchService } from './branch.service';
import { BranchSettingsService } from './branch-settings.service';
import { CreditTermLimitService } from './credit-term-limit.service';
import { DepartmentService } from './department.service';
import { EmployeeService } from './employee.service';
import { ErpUserService } from './erp-user.service';
import { UserEnrichmentService } from './user-enrichment.service';
import { Branch } from './entities/branch.entity';
import { BranchSettings } from './entities/branch-settings.entity';
import { CreditTermLimit } from './entities/credit-term-limit.entity';
import { Department } from './entities/department.entity';
import { ErpUser } from './entities/erp-user.entity';
import { RoleAccessScope } from './entities/role-access-scope.entity';
import { RoleProvisioningService } from './role-provisioning.service';
import { RoleScopeConfigService } from './role-scope-config.service';
import { Warehouse } from './entities/warehouse.entity';
import { WarehouseService } from './warehouse.service';

const adminApiSchema = gql`
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
        defaultWarehouseId: String!
        visibleWarehouseIds: [String!]
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
        ): BranchSettings!
        createBranch(name: String!): Branch!
        createAdministratorFromErpUser(erpId: String!): Administrator!
        resendAdministratorPasswordReset(administratorId: ID!): Boolean!
        setAdministratorActive(administratorId: ID!, isActive: Boolean!): Boolean!
    }
`;

@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [
        RoleAccessScope,
        Department,
        Branch,
        Warehouse,
        BranchSettings,
        CreditTermLimit,
        ErpUser,
    ],
    providers: [
        AccessScopeService,
        RoleScopeConfigService,
        DepartmentService,
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
    ],
    exports: [
        AccessScopeService,
        RoleScopeConfigService,
        DepartmentService,
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
        resolvers: [AccessControlResolver, AdministratorStatusResolver],
    },
    configuration: (config: RuntimeVendureConfig) => {
        // All five fields below are system-managed, never hand-entered: `readonly: true` strips
        // each from the GraphQL Update/CreateAdministratorCustomFieldsInput the Dashboard and
        // manager portal forms are generated from, so neither surface renders an editable
        // control for them — editing any of these by hand would silently break the
        // correlation/sync mechanism that owns it (see each field's own comment for which one).
        // `readonly` only affects the GraphQL input schema, not direct TS service calls — every
        // writer below (EmployeeService, UserEnrichmentService, AdministratorProvisioningService,
        // plugin-sync) calls AdministratorService.update/create() directly, bypassing that input
        // type entirely, so none of them are affected by this.
        config.customFields.Administrator = [
            ...(config.customFields.Administrator ?? []),
            {
                // Set by EmployeeService from the ERP org-structure import (EmployeeRecordInput) —
                // see employee.service.ts. Purely informational (never a scope gate — see
                // docs/access-control.md's "departmentId must never gate visibility").
                name: 'departmentId',
                type: 'string' as const,
                nullable: true,
                readonly: true,
                label: [{ languageCode: LanguageCode.en, value: 'Department ID' }],
            },
            {
                // Set by EmployeeService, resolved from the ERP's department/division id to a real
                // mivend Branch.id (see employee.service.ts's own comment on that resolution) —
                // the real access-scope filter axis, per docs/access-control.md.
                name: 'branchId',
                type: 'string' as const,
                nullable: true,
                readonly: true,
                label: [{ languageCode: LanguageCode.en, value: 'Branch ID' }],
            },
            {
                // Set by EmployeeService from the ERP org-structure import, same record as
                // departmentId/branchId above.
                name: 'position',
                type: 'string' as const,
                nullable: true,
                readonly: true,
                label: [{ languageCode: LanguageCode.en, value: 'Job position' }],
            },
            {
                // Owned by @mivend/plugin-sync (registered here since this is where
                // Administrator's customFields array already lives — see the backend-plugin-rules skill's
                // declaration-merging precedent for reading a field without a package
                // dependency). Branch-only: correlates a branch's read-only Administrator
                // replica with its Central source record. Always null on Central itself.
                // See docs/architecture.md's "User identity: Central is master, not federated".
                name: 'sourceAdministratorId',
                type: 'string' as const,
                nullable: true,
                readonly: true,
                label: [{ languageCode: LanguageCode.en, value: 'Source Administrator ID' }],
            },
            {
                // Issue #119, Decision 5: anchored once at Administrator creation
                // (AdministratorProvisioningService.createFromPending) — never re-derived or
                // hand-edited afterwards, that's the whole point of anchoring on erpId instead of
                // re-matching by email. Also correlates with the ERP's own "Пользователи" GUID
                // (UserChanged.entity_id) for #109's enrichment-only path — see
                // UserEnrichmentService.linkAndEnrich. `unique: true` gets Vendure's real
                // DB-level unique constraint (CustomFieldConfig supports this natively — verified
                // against @vendure/core source), not just an application-level check.
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
                // Issue #66 fallback: any counterparty/manager with no branchId (or a branchId
                // with no BranchSettings configured yet) resolves to this branch's settings —
                // see BranchSettingsService.resolveEffective. Deliberately just an id pointing at
                // a real Branch row, not a duplicated settings blob.
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
export class AccessControlPlugin {}
