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
import { PendingErpUserService } from './pending-erp-user.service';
import { UserEnrichmentService } from './user-enrichment.service';
import { Branch } from './entities/branch.entity';
import { BranchSettings } from './entities/branch-settings.entity';
import { CreditTermLimit } from './entities/credit-term-limit.entity';
import { Department } from './entities/department.entity';
import { PendingErpUser } from './entities/pending-erp-user.entity';
import { RoleAccessScope } from './entities/role-access-scope.entity';
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

    # implements Node/PaginatedList — not just server-side convention (backend-plugin-rules
    # skill's own "generateListOptions auto-detects PaginatedList" mechanism, confirmed safe
    # here since it only ever merges into an existing same-named ListOptions/appends an options
    # arg when no arg of that type already exists, never duplicates). Also required client-side:
    # @vendure/dashboard's ListPage/useGeneratedColumns silently produces zero auto-generated
    # columns for a list item type that doesn't implement these — confirmed live (issue #119
    # Phase 1's own "Pending ERP users" page rendered only its one additionalColumn until this
    # was added), unlike deactivatedAdministrators, which reuses the native, already-compliant
    # Administrator/AdministratorList.
    type PendingErpUser implements Node {
        id: ID!
        erpId: String!
        fullName: String
        email: String
        departmentId: String
        firstSeenAt: DateTime!
        lastSeenAt: DateTime!
    }

    type PendingErpUserList implements PaginatedList {
        items: [PendingErpUser!]!
        totalItems: Int!
    }

    input PendingErpUserFilterParameter {
        erpId: StringOperators
        fullName: StringOperators
        email: StringOperators
    }

    input PendingErpUserSortParameter {
        erpId: SortOrder
        fullName: SortOrder
        email: SortOrder
        firstSeenAt: SortOrder
        lastSeenAt: SortOrder
    }

    input PendingErpUserListOptions {
        skip: Int
        take: Int
        sort: PendingErpUserSortParameter
        filter: PendingErpUserFilterParameter
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

    extend type Query {
        departments: [Department!]!
        branches: [Branch!]!
        warehouses: [Warehouse!]!
        branchSettings(branchId: String!): BranchSettings
        teamMembers: [TeamMember!]!
        teamDirectory: [TeamDirectoryMember!]!
        creditTermLimit(roleCode: String!): CreditTermLimit
        roleAccessScopeConfig(roleCode: String!): String
        # Issue #119 Phase 1: both real server-side pagination, backing the Dashboard "ERP
        # users" screens' ListPage components — see access-control.resolver.ts's own comments.
        pendingErpUsers(options: PendingErpUserListOptions): PendingErpUserList!
        deactivatedAdministrators(options: AdministratorListOptions): AdministratorList!
        # Issue #119 Phase 2: backs the manager-portal Settings > Users screen — every
        # Administrator, filterable by status (omit status for "All").
        portalUsers(options: AdministratorListOptions, status: PortalUserStatus): AdministratorList!
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
        PendingErpUser,
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
        PendingErpUserService,
        AdministratorActivationService,
        AdministratorProvisioningService,
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
        PendingErpUserService,
        AdministratorActivationService,
        AdministratorProvisioningService,
    ],
    adminApiExtensions: {
        schema: adminApiSchema,
        resolvers: [AccessControlResolver, AdministratorStatusResolver],
    },
    configuration: (config: RuntimeVendureConfig) => {
        config.customFields.Administrator = [
            ...(config.customFields.Administrator ?? []),
            {
                name: 'departmentId',
                type: 'string' as const,
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Department ID' }],
            },
            {
                name: 'branchId',
                type: 'string' as const,
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Branch ID' }],
            },
            {
                name: 'position',
                type: 'string' as const,
                nullable: true,
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
                label: [{ languageCode: LanguageCode.en, value: 'Source Administrator ID' }],
            },
            {
                // Issue #109: correlates this Administrator with 1C's own "Пользователи" GUID
                // (UserChanged.entity_id) — see UserEnrichmentService.linkAndEnrich. Matched once
                // by email, then persisted here for every later event so re-matching by email
                // (which can itself change in 1C) is never needed again. Application-level
                // uniqueness only (looked up before assigning) — Vendure customFields don't
                // support a DB-level unique constraint here, same as branchId/departmentId above.
                name: 'erpId',
                type: 'string' as const,
                nullable: true,
                unique: true,
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
