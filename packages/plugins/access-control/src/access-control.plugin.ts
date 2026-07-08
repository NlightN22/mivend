import {
    LanguageCode,
    PluginCommonModule,
    RuntimeVendureConfig,
    VendurePlugin,
} from '@vendure/core';

import { AccessScopeService } from './access-scope.service';
import { RoleScopeConfigService } from './role-scope-config.service';

@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [AccessScopeService, RoleScopeConfigService],
    exports: [AccessScopeService, RoleScopeConfigService],
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
        config.customFields.Role = [
            ...(config.customFields.Role ?? []),
            {
                name: 'accessScopeConfig',
                type: 'text' as const,
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Access scope config (JSON)' }],
                description: [
                    {
                        languageCode: LanguageCode.en,
                        value: 'JSON map of resource -> max scope ("own" | "department" | "all"), e.g. {"counterparty":"department"}',
                    },
                ],
            },
        ];
        return config;
    },
    compatibility: '>0.0.0',
})
export class AccessControlPlugin {}
