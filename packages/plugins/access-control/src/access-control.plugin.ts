import {
    LanguageCode,
    PluginCommonModule,
    RuntimeVendureConfig,
    VendurePlugin,
} from '@vendure/core';
import gql from 'graphql-tag';

import { AccessControlResolver } from './access-control.resolver';
import { AccessScopeService } from './access-scope.service';
import { RoleAccessScope } from './entities/role-access-scope.entity';
import { RoleScopeConfigService } from './role-scope-config.service';

const adminApiSchema = gql`
    extend type Mutation {
        setRoleAccessScopeConfig(roleCode: String!, accessScopeConfig: String!): Boolean!
    }
`;

@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [RoleAccessScope],
    providers: [AccessScopeService, RoleScopeConfigService],
    exports: [AccessScopeService, RoleScopeConfigService],
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
        ];
        return config;
    },
    compatibility: '>0.0.0',
})
export class AccessControlPlugin {}
