import {
    LanguageCode,
    PluginCommonModule,
    RuntimeVendureConfig,
    VendurePlugin,
} from '@vendure/core';
import gql from 'graphql-tag';

import { AccessControlResolver } from './access-control.resolver';
import { AccessScopeService } from './access-scope.service';
import { BranchService } from './branch.service';
import { BranchSettingsService } from './branch-settings.service';
import { CreditTermLimitService } from './credit-term-limit.service';
import { DepartmentService } from './department.service';
import { EmployeeService } from './employee.service';
import { Branch } from './entities/branch.entity';
import { BranchSettings } from './entities/branch-settings.entity';
import { CreditTermLimit } from './entities/credit-term-limit.entity';
import { Department } from './entities/department.entity';
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
        branchId: String!
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

    extend type Query {
        departments: [Department!]!
        branches: [Branch!]!
        warehouses: [Warehouse!]!
        branchSettings(branchId: String!): BranchSettings
        teamMembers: [TeamMember!]!
        teamDirectory: [TeamDirectoryMember!]!
        creditTermLimit(roleCode: String!): CreditTermLimit
        roleAccessScopeConfig(roleCode: String!): String
    }

    extend type Mutation {
        setRoleAccessScopeConfig(roleCode: String!, accessScopeConfig: String!): Boolean!
        setCreditTermLimit(roleCode: String!, maxExtraDays: Int!, maxAmount: Int): CreditTermLimit!
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
    }
`;

@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [RoleAccessScope, Department, Branch, Warehouse, BranchSettings, CreditTermLimit],
    providers: [
        AccessScopeService,
        RoleScopeConfigService,
        DepartmentService,
        BranchService,
        WarehouseService,
        BranchSettingsService,
        EmployeeService,
        CreditTermLimitService,
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
    ],
    adminApiExtensions: {
        schema: adminApiSchema,
        resolvers: [AccessControlResolver],
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
