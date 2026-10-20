import {
    LanguageCode,
    PluginCommonModule,
    RuntimeVendureConfig,
    VendurePlugin,
} from '@vendure/core';
import { CustomerPricingPlugin } from '@mivend/plugin-customer-pricing';
import { departmentBranchBundle } from './department-branch.bundle';
import { visibilityGrantBundle } from './visibility-grant.bundle';
import { adminApiSchema } from './access-control.schema';

import { AccessControlResolver, AdministratorStatusResolver } from './access-control.resolver';
import { AccessScopeService } from './access-scope.service';
import { TeamAdministratorService } from './team-administrator.service';
import { AdministratorActivationService } from './administrator-activation.service';
import { AdministratorProvisioningService } from './administrator-provisioning.service';
import { BranchService } from './branch.service';
import { DefaultBranchBootstrapService } from './default-branch-bootstrap.service';
import { DefaultChannelCurrencyBootstrapService } from './default-channel-currency-bootstrap.service';
import { CustomerPriceTypeResolver, PriceTypeAdminResolver } from './price-type-admin.resolver';
import { PriceTypeAccessService } from './price-type-access.service';
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
        ...departmentBranchBundle.entities,
        ...visibilityGrantBundle.entities,
    ],
    providers: [
        ...departmentBranchBundle.providers,
        ...visibilityGrantBundle.providers,
        AccessScopeService,
        TeamAdministratorService,
        RoleScopeConfigService,
        DepartmentService,
        PositionService,
        BranchService,
        WarehouseService,
        BranchSettingsService,
        PriceTypeAccessService,
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
        ...departmentBranchBundle.providers,
        ...visibilityGrantBundle.providers,
        AccessScopeService,
        TeamAdministratorService,
        RoleScopeConfigService,
        DepartmentService,
        PositionService,
        BranchService,
        WarehouseService,
        BranchSettingsService,
        PriceTypeAccessService,
        EmployeeService,
        CreditTermLimitService,
        UserEnrichmentService,
        ErpUserService,
        AdministratorActivationService,
        AdministratorProvisioningService,
    ],
    adminApiExtensions: {
        schema: adminApiSchema,
        resolvers: [
            AccessControlResolver,
            AdministratorStatusResolver,
            ErpUserResolver,
            PriceTypeAdminResolver,
            ...departmentBranchBundle.resolvers,
            CustomerPriceTypeResolver,
        ],
    },
    configuration: (config: RuntimeVendureConfig) => {
        config.schedulerOptions.tasks = [
            ...(config.schedulerOptions.tasks ?? []),
            ...departmentBranchBundle.scheduledTasks(),
        ];
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
