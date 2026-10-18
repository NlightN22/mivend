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
import { CreditTermExtensionCheck } from './credit-term-extension.check';
import { CreditTermService } from './credit-term.service';
import { AdministratorLinkedListener } from './administrator-linked.listener';
import { CounterpartyPortalAccessService } from './counterparty-portal-access.service';
import {
    CounterpartyPortalAccessFieldResolver,
    CounterpartyPortalAccessMutationResolver,
} from './counterparty-portal-access.resolver';
import { adminApiSchema } from './counterparty.schema';
import { shopApiSchema } from './trading-point.schema';

const shopResolvers = [
    CustomerCounterpartyResolver,
    CustomerTradingPointResolver,
    CounterpartyTradingPointResolver,
    TradingPointResolver,
    CustomerTradingPointsQueryResolver,
    CustomerTradingPointsMutationResolver,
];

const adminResolvers = [
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
];

@VendurePlugin({
    imports: [
        PluginCommonModule,
        CustomerPricingPlugin,
        AccessControlPlugin,
        ApprovalWorkflowPlugin,
        ChecksPlugin,
        VersioningPlugin,
    ],
    entities: [Counterparty, TradingPoint, ContactPerson, CounterpartyTeamMember, Contract],
    shopApiExtensions: {
        schema: shopApiSchema,
        resolvers: shopResolvers,
    },
    adminApiExtensions: {
        schema: adminApiSchema,
        resolvers: adminResolvers,
    },
    providers: [
        CounterpartyService,
        CounterpartyConsumer,
        TradingPointService,
        TradingPointConsumer,
        CreditTermExtensionCheck,
        CreditTermService,
        CounterpartyTeamService,
        CounterpartyManagerAssignmentService,
        AdministratorLinkedListener,
        CounterpartyPortalAccessService,
        ContractService,
        CreditLimitCheckService,
        CreditLimitRecomputeService,
    ],
    exports: [
        CounterpartyService,
        TradingPointService,
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
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Counterparty ID' }],
            },
            {
                name: 'portalRole',
                type: 'string' as const,
                nullable: true,
                defaultValue: 'buyer',
                label: [{ languageCode: LanguageCode.en, value: 'Portal role' }],
            },
            {
                name: 'preferredTradingPointId',
                type: 'string' as const,
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Preferred trading point ID' }],
            },
        ];
        return config;
    },
    compatibility: '>0.0.0',
})
export class CounterpartyPlugin {}
