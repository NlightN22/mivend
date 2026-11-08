import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import gql from 'graphql-tag';
import { AccessControlPlugin } from '@mivend/plugin-access-control';
import { CounterpartyPlugin } from '@mivend/plugin-counterparty';

import { GrantedRetroBonus } from './granted-retro-bonus.entity';
import {
    GrantedRetroBonusFieldResolver,
    GrantedRetroBonusResolver,
} from './granted-retro-bonus.resolver';
import { GrantedRetroBonusService } from './granted-retro-bonus.service';
import { RetroBonusRule } from './retro-bonus-rule.entity';
import {
    RetroBonusRuleCounterparty,
    RetroBonusRuleProduct,
    RetroBonusRuleFilterTerm,
} from './retro-bonus-rule-membership.entity';
import {
    RetroBonusRuleAccrualKindResolver,
    RetroBonusRulePriceTypeResolver,
    RetroBonusRuleResolver,
} from './retro-bonus-rule.resolver';
import { RetroBonusRuleReclassifyService } from './retro-bonus-rule-reclassify.service';
import { RetroBonusOrderResolver } from './retro-bonus-order.resolver';
import { RetroBonusOrderService } from './retro-bonus-order.service';
import { RetroBonusRuleService } from './retro-bonus-rule.service';
import { ErpOrderPlugin } from '@mivend/plugin-erp-order';

const adminApiSchema = gql`
    type RetroBonusRule {
        id: ID!
        "The ERP setup document uuid."
        erpId: String!
        documentNumber: String!
        recipientCounterpartyErpId: String
        recipientContractErpId: String
        priceTypeErpId: String
        organizationErpId: String
        allCounterparties: Boolean!
        allProducts: Boolean!
        isInstant: Boolean!
        accrualPeriod: String
        accrualDayNumber: Int!
        accrualKind: String!
        "Translated display label for accrualKind's closed 4-value set — never the raw value."
        accrualKindLabel: String!
        percent: Float!
        conditionAmount: Float
        conditionQuantity: Float
        validFrom: DateTime!
        validTo: DateTime
        "Why an active rule never applies (dynamic filter not evaluated); null when it can."
        inactiveReason: String
    }

    type GrantedRetroBonus implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        erpId: String!
        sourceDocumentErpId: String!
        sourceCounterpartyErpId: String!
        recipientCounterpartyErpId: String!
        productErpId: String!
        discountDocumentErpId: String
        "Opaque ERP classifier text — no fixed value set, never mapped."
        operationKind: String
        accrualKind: String
        accrualKindLabel: String
        percent: Float!
        quantity: Float!
        amount: Float!
        orderErpId: String
    }

    type GrantedRetroBonusList implements PaginatedList {
        items: [GrantedRetroBonus!]!
        totalItems: Int!
    }

    input GrantedRetroBonusListOptions {
        take: Int
        skip: Int
    }

    "The retro bonus the customer's active rules promise on one order line; display only, never part of the price."
    type OrderRetroBonus {
        "True when the customer has at least one active rule, even if none covers a line of this order."
        hasRules: Boolean!
        lines: [OrderLineRetroBonus!]!
    }

    type OrderLineRetroBonus {
        orderLineId: ID!
        percent: Float!
        "Null when the rule has a threshold."
        amount: Money
    }

    extend type Query {
        orderRetroBonus(orderId: ID!): OrderRetroBonus!
        grantedRetroBonuses(
            counterpartyId: ID!
            options: GrantedRetroBonusListOptions
        ): GrantedRetroBonusList!
        retroBonusRules(counterpartyId: ID!, contractId: ID): [RetroBonusRule!]!
    }
`;

// Issue #102/#290: read-only retro-bonus terms (ERP's RetroBonusSetupChanged) — manager-portal
// display only, never applied to order pricing (orderRetroBonus shows what the rules promise per order line).
@VendurePlugin({
    imports: [PluginCommonModule, AccessControlPlugin, CounterpartyPlugin, ErpOrderPlugin],
    entities: [
        RetroBonusRule,
        RetroBonusRuleCounterparty,
        RetroBonusRuleProduct,
        RetroBonusRuleFilterTerm,
        GrantedRetroBonus,
    ],
    adminApiExtensions: {
        schema: adminApiSchema,
        resolvers: [
            RetroBonusRuleResolver,
            RetroBonusOrderResolver,
            RetroBonusRuleAccrualKindResolver,
            RetroBonusRulePriceTypeResolver,
            GrantedRetroBonusResolver,
            GrantedRetroBonusFieldResolver,
        ],
    },
    providers: [
        RetroBonusOrderService,
        RetroBonusRuleService,
        RetroBonusRuleReclassifyService,
        GrantedRetroBonusService,
    ],
    exports: [RetroBonusRuleService, GrantedRetroBonusService],
    compatibility: '>0.0.0',
})
export class RetroBonusPlugin {}
