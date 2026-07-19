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
import { CreditTermLimitService } from './credit-term-limit.service';
import { DepartmentService } from './department.service';
import { EmployeeService } from './employee.service';
import { Branch } from './entities/branch.entity';
import { CreditTermLimit } from './entities/credit-term-limit.entity';
import { Department } from './entities/department.entity';
import { RoleAccessScope } from './entities/role-access-scope.entity';
import { RoleScopeConfigService } from './role-scope-config.service';

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
        teamMembers: [TeamMember!]!
        teamDirectory: [TeamDirectoryMember!]!
        creditTermLimit(roleCode: String!): CreditTermLimit
        roleAccessScopeConfig(roleCode: String!): String
    }

    extend type Mutation {
        setRoleAccessScopeConfig(roleCode: String!, accessScopeConfig: String!): Boolean!
        setCreditTermLimit(roleCode: String!, maxExtraDays: Int!, maxAmount: Int): CreditTermLimit!
    }
`;

@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [RoleAccessScope, Department, Branch, CreditTermLimit],
    providers: [
        AccessScopeService,
        RoleScopeConfigService,
        DepartmentService,
        BranchService,
        EmployeeService,
        CreditTermLimitService,
    ],
    exports: [
        AccessScopeService,
        RoleScopeConfigService,
        DepartmentService,
        BranchService,
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
                // Administrator's customFields array already lives — see AGENTS.md's
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
        return config;
    },
    compatibility: '>0.0.0',
})
export class AccessControlPlugin {}
