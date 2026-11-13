import { ErpIdLookupService } from './erp-id-lookup.service';
import { StaffSearchPlugin } from '@mivend/plugin-staff-search';
import { CounterpartySearchProvider } from './counterparty-search.provider';
import { CounterpartyBatchLoaders } from './counterparty-batch-loaders.service';
import {
    LanguageCode,
    PluginCommonModule,
    RuntimeVendureConfig,
    VendurePlugin,
} from '@vendure/core';
import { CustomerPricingPlugin } from '@mivend/plugin-customer-pricing';
import { AccessControlPlugin } from '@mivend/plugin-access-control';
import { ApprovalWorkflowPlugin } from '@mivend/plugin-approval-workflow';
import { ChecksPlugin } from '@mivend/plugin-checks';
import { VersioningPlugin } from '@mivend/plugin-versioning';
import { SessionManagementPlugin } from '@mivend/plugin-session-management';

import { CounterpartyConsumer } from './consumers/counterparty.consumer';
import { TradingPointConsumer } from './consumers/trading-point.consumer';
import { Counterparty } from './entities/counterparty.entity';
import { ContactPerson } from './entities/contact-person.entity';
import { ContactPoint } from './entities/contact-point.entity';
import { ContactRole } from './entities/contact-role.entity';
import { CounterpartyContactPoint } from './entities/counterparty-contact-point.entity';
import { TradingPointContactPoint } from './entities/trading-point-contact-point.entity';
import { ContactPersonContactPoint } from './entities/contact-person-contact-point.entity';
import { AdministratorContactPoint } from './entities/administrator-contact-point.entity';
import { OrganizationContactPoint } from './entities/organization-contact-point.entity';
import { CounterpartyContactPerson } from './entities/counterparty-contact-person.entity';
import { ContactPointService } from './contact-point.service';
import { ErpContactPersonService } from './erp-contact-person.service';
import { TradingPoint } from './entities/trading-point.entity';
import { ContractPowerOfAttorneyErp } from './entities/contract-power-of-attorney-erp.entity';
import { PowerOfAttorneyErpService } from './power-of-attorney-erp.service';
import { TradingPointErp } from './entities/trading-point-erp.entity';
import { CounterpartyContactErp } from './entities/counterparty-contact-erp.entity';
import { CounterpartyGroupErp } from './entities/counterparty-group-erp.entity';
import { PointOfSaleTypeErp } from './entities/point-of-sale-type-erp.entity';
import { TradingPointChange } from './entities/trading-point-change.entity';
import { CounterpartyTeamMember } from './entities/counterparty-team-member.entity';
import { Contract } from './entities/contract.entity';
import { ContractService } from './contract.service';
import { CreditLimitCheckService } from './credit-limit-check.service';
import { CreditLimitRecomputeService } from './credit-limit-recompute.service';
import {
    CustomerCounterpartyResolver,
    CounterpartyResolver,
    CounterpartyCreditResolver,
    CounterpartyPriceTypeResolver,
    CounterpartyChosenContactResolver,
    CounterpartyCustomerLinkResolver,
} from './counterparty.resolver';
import { CustomerPortalActiveResolver } from './customer-portal-active.resolver';
import {
    CounterpartyTeamFieldResolver,
    CounterpartyTeamMutationResolver,
} from './counterparty-team.resolver';
import { CounterpartyBranchOverrideResolver } from './counterparty-branch-override.resolver';
import { CounterpartyBranchOverrideService } from './counterparty-branch-override.service';
import { CounterpartyManagerAssignmentService } from './counterparty-manager-assignment.service';
import { CounterpartyTeamService } from './counterparty-team.service';
import {
    CustomerTradingPointResolver,
    CounterpartyTradingPointResolver,
    TradingPointResolver,
    TradingPointAdminResolver,
    CustomerTradingPointsQueryResolver,
    CustomerTradingPointsMutationResolver,
} from './trading-point.resolver';
import { CreditTermResolver } from './credit-term.resolver';
import { CounterpartyService } from './counterparty.service';
import { CounterpartySuggestService } from './counterparty-suggest.service';
import { TradingPointService } from './trading-point.service';
import { TradingPointChangeAdminResolver } from './trading-point-change.resolver';
import { TradingPointChangeService } from './trading-point-change.service';
import { TradingPointLocationReportService } from './trading-point-location-report.service';
import { CreditTermExtensionCheck } from './credit-term-extension.check';
import { CreditTermService } from './credit-term.service';
import { EntityVersionScopeRegistrar } from './entity-version-scope.registrar';
import { CreditTermScopeRegistrar } from './credit-term-scope.registrar';
import { AdministratorLinkedListener } from './administrator-linked.listener';
import { AdministratorContactsListener } from './administrator-contacts.listener';
import { CounterpartyPortalAccessService } from './counterparty-portal-access.service';
import { CounterpartyPortalAccessExecutor } from './counterparty-portal-access.executor';
import { BulkOperationsPlugin } from '@mivend/plugin-bulk-operations';
import {
    CounterpartyPortalAccessFieldResolver,
    CounterpartyPortalAccessMutationResolver,
} from './counterparty-portal-access.resolver';
import gql from 'graphql-tag';
import { adminApiSchema } from './counterparty.schema';
import { visibilityBundle } from './visibility/visibility.bundle';
import { visibilitySchema } from './visibility/visibility.schema';
import { shopApiSchema } from './trading-point.schema';
import { myContractsSchema } from './my-contracts.schema';
import { MyContractsResolver } from './my-contracts.resolver';
import { AddressSuggestResolver } from './address-suggest.resolver';
import { AdminGeoResolver } from './geo/admin-geo.resolver';
import { GeoResolver } from './geo/geo.resolver';
import { geoSchema } from './geo/geo.schema';
import { GeoService } from './geo/geo.service';
import { AddressSuggestService } from './address-suggest.service';
import { ScopedCustomerResolver } from './scoped-customer.resolver';

const shopResolvers = [
    MyContractsResolver,
    CustomerCounterpartyResolver,
    CustomerTradingPointResolver,
    CounterpartyTradingPointResolver,
    TradingPointResolver,
    CustomerTradingPointsQueryResolver,
    CustomerTradingPointsMutationResolver,
    AddressSuggestResolver,
    GeoResolver,
];

const adminResolvers = [
    CustomerPortalActiveResolver,
    CounterpartyBranchOverrideResolver,
    CounterpartyPriceTypeResolver,
    CustomerCounterpartyResolver,
    CustomerTradingPointResolver,
    CounterpartyTradingPointResolver,
    TradingPointResolver,
    CounterpartyResolver,
    CounterpartyCreditResolver,
    CounterpartyChosenContactResolver,
    CounterpartyCustomerLinkResolver,
    TradingPointAdminResolver,
    TradingPointChangeAdminResolver,
    AdminGeoResolver,
    CreditTermResolver,
    CounterpartyTeamFieldResolver,
    CounterpartyTeamMutationResolver,
    CounterpartyPortalAccessFieldResolver,
    CounterpartyPortalAccessMutationResolver,
    ScopedCustomerResolver,
    ...visibilityBundle.resolvers,
];

@VendurePlugin({
    imports: [
        StaffSearchPlugin,
        PluginCommonModule,
        CustomerPricingPlugin,
        AccessControlPlugin,
        ApprovalWorkflowPlugin,
        BulkOperationsPlugin,
        ChecksPlugin,
        VersioningPlugin,
        SessionManagementPlugin,
    ],
    entities: [
        Counterparty,
        TradingPoint,
        TradingPointErp,
        CounterpartyContactErp,
        CounterpartyGroupErp,
        PointOfSaleTypeErp,
        TradingPointChange,
        ContactPerson,
        ContactPoint,
        ContactRole,
        CounterpartyContactPoint,
        TradingPointContactPoint,
        ContactPersonContactPoint,
        AdministratorContactPoint,
        OrganizationContactPoint,
        CounterpartyContactPerson,
        CounterpartyTeamMember,
        Contract,
        ContractPowerOfAttorneyErp,
    ],
    shopApiExtensions: {
        schema: gql`
            ${shopApiSchema}
            ${myContractsSchema}
            ${geoSchema}
        `,
        resolvers: shopResolvers,
    },
    adminApiExtensions: {
        schema: gql`
            ${adminApiSchema}
            ${visibilitySchema}
            ${geoSchema}
        `,
        resolvers: adminResolvers,
    },
    providers: [
        CounterpartySearchProvider,
        ...visibilityBundle.providers,
        CounterpartyPortalAccessExecutor,
        CounterpartyService,
        CounterpartyBatchLoaders,
        ErpIdLookupService,
        ContactPointService,
        ErpContactPersonService,
        CounterpartyConsumer,
        TradingPointService,
        TradingPointChangeService,
        TradingPointLocationReportService,
        AddressSuggestService,
        CounterpartySuggestService,
        GeoService,
        TradingPointConsumer,
        CreditTermExtensionCheck,
        CreditTermService,
        CounterpartyTeamService,
        CounterpartyManagerAssignmentService,
        CounterpartyBranchOverrideService,
        AdministratorLinkedListener,
        AdministratorContactsListener,
        EntityVersionScopeRegistrar,
        CreditTermScopeRegistrar,
        CounterpartyPortalAccessService,
        ContractService,
        PowerOfAttorneyErpService,
        CreditLimitCheckService,
        CreditLimitRecomputeService,
    ],
    exports: [
        CounterpartyService,
        ContactPointService,
        ErpContactPersonService,
        ErpIdLookupService,
        TradingPointService,
        TradingPointChangeService,
        TradingPointLocationReportService,
        ContractService,
        PowerOfAttorneyErpService,
        CreditLimitCheckService,
        CreditLimitRecomputeService,
    ],
    configuration: (config: RuntimeVendureConfig) => {
        config.customFields.Customer = [
            ...(config.customFields.Customer ?? []),
            {
                name: 'counterpartyId',
                type: 'string' as const,
                readonly: true,
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Counterparty ID' }],
            },
            {
                name: 'portalRole',
                type: 'string' as const,
                readonly: true,
                nullable: true,
                defaultValue: 'buyer',
                label: [{ languageCode: LanguageCode.en, value: 'Portal role' }],
            },
            {
                name: 'preferredTradingPointId',
                type: 'string' as const,
                readonly: true,
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Preferred trading point ID' }],
            },
        ];
        return config;
    },
    compatibility: '>0.0.0',
})
export class CounterpartyPlugin {}
