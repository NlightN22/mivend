import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import gql from 'graphql-tag';
import { AccessControlPlugin } from '@mivend/plugin-access-control';
import { CounterpartyPlugin } from '@mivend/plugin-counterparty';

import { RetroBonusRule } from './retro-bonus-rule.entity';
import {
    RetroBonusRuleAccrualKindResolver,
    RetroBonusRuleResolver,
} from './retro-bonus-rule.resolver';
import { RetroBonusRuleService } from './retro-bonus-rule.service';

const adminApiSchema = gql`
    type RetroBonusRule {
        id: ID!
        erpId: String!
        productErpId: String!
        counterpartyErpId: String!
        recipientContractErpId: String
        priceTypeErpId: String
        isInstant: Boolean!
        accrualPeriod: String
        accrualDayNumber: Int!
        accrualKind: String!
        "Translated display label for accrualKind's closed 4-value set — never the raw value."
        accrualKindLabel: String!
        percent: Float!
        limitAmount: Float
        conditionAmount: Float
        conditionQuantity: Float
        validFrom: DateTime!
        validTo: DateTime
    }

    extend type Query {
        retroBonusRules(counterpartyId: ID!, contractId: ID): [RetroBonusRule!]!
    }
`;

// Issue #102: read-only retro-bonus terms log (ERP's RetroBonusRuleChanged) — manager-portal
// display only, never applied to order pricing. See RetroBonusRule's own doc comment.
@VendurePlugin({
    imports: [PluginCommonModule, AccessControlPlugin, CounterpartyPlugin],
    entities: [RetroBonusRule],
    adminApiExtensions: {
        schema: adminApiSchema,
        resolvers: [RetroBonusRuleResolver, RetroBonusRuleAccrualKindResolver],
    },
    providers: [RetroBonusRuleService],
    exports: [RetroBonusRuleService],
    compatibility: '>0.0.0',
})
export class RetroBonusPlugin {}
