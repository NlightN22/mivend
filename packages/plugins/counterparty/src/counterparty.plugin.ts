import { ErpIdLookupService } from './erp-id-lookup.service';
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
import { TradingPoint } from './entities/trading-point.entity';
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
    CounterpartyCustomerLinkResolver,
} from './counterparty.resolver';
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
import { TradingPointService } from './trading-point.service';
import { TradingPointLocationReportService } from './trading-point-location-report.service';
import { CreditTermExtensionCheck } from './credit-term-extension.check';
import { CreditTermService } from './credit-term.service';
import { EntityVersionScopeRegistrar } from './entity-version-scope.registrar';
import { CreditTermScopeRegistrar } from './credit-term-scope.registrar';
import { AdministratorLinkedListener } from './administrator-linked.listener';
import { CounterpartyPortalAccessService } from './counterparty-portal-access.service';
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
    CounterpartyBranchOverrideResolver,
    CounterpartyPriceTypeResolver,
    CustomerCounterpartyResolver,
    CustomerTradingPointResolver,
    CounterpartyTradingPointResolver,
    TradingPointResolver,
    CounterpartyResolver,
    CounterpartyCreditResolver,
    CounterpartyCustomerLinkResolver,
    TradingPointAdminResolver,
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
        PluginCommonModule,
        CustomerPricingPlugin,
        AccessControlPlugin,
        ApprovalWorkflowPlugin,
        ChecksPlugin,
        VersioningPlugin,
        SessionManagementPlugin,
    ],
    entities: [Counterparty, TradingPoint, ContactPerson, CounterpartyTeamMember, Contract],
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
        `,
        resolvers: adminResolvers,
    },
    providers: [
        ...visibilityBundle.providers,
        CounterpartyService,
        CounterpartyBatchLoaders,
        ErpIdLookupService,
        CounterpartyConsumer,
        TradingPointService,
        TradingPointLocationReportService,
        AddressSuggestService,
        GeoService,
        TradingPointConsumer,
        CreditTermExtensionCheck,
        CreditTermService,
        CounterpartyTeamService,
        CounterpartyManagerAssignmentService,
        CounterpartyBranchOverrideService,
        AdministratorLinkedListener,
        EntityVersionScopeRegistrar,
        CreditTermScopeRegistrar,
        CounterpartyPortalAccessService,
        ContractService,
        CreditLimitCheckService,
        CreditLimitRecomputeService,
    ],
    exports: [
        CounterpartyService,
        ErpIdLookupService,
        TradingPointService,
        TradingPointLocationReportService,
        ContractService,
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
