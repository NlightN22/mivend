import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import gql from 'graphql-tag';

import { ProductVariantPriceEntry } from './price-entry.entity';
import { DiscountRule } from './discount-rule.entity';
import {
    DiscountRuleAdminResolver,
    OrderLineDiscountResolver,
    PriceEntryAdminResolver,
    ProductVariantPriceResolver,
} from './price-entry.resolver';
import { PriceEntryService } from './price-entry.service';
import { DiscountRuleService } from './discount-rule.service';
import { PriceResolutionService } from './price-resolution.service';
import { TierRebalanceService } from './tier-rebalance.service';

const shopApiSchema = gql`
    type DiscountTier {
        percent: Int!
        minWeightKg: Float
        minAmount: Int
    }

    enum TierMetric {
        WEIGHT
        AMOUNT
    }

    type TierProgress {
        facetName: String!
        metric: TierMetric!
        current: Float!
        currentPercent: Int
        nextThreshold: Float
        nextPercent: Int
    }

    extend type ProductVariant {
        customerPrice: Int
        compareAtPrice: Int
        discountTiers: [DiscountTier!]!
    }

    extend type OrderLine {
        compareAtPrice: Int
        tierProgress: TierProgress
    }
`;

const adminApiSchema = gql`
    type PriceEntry {
        id: ID!
        variantId: ID!
        priceTypeCode: String!
        price: Int!
    }

    input PriceEntryInput {
        variantId: ID!
        priceTypeCode: String!
        price: Int!
    }

    type DiscountRule {
        id: ID!
        erpId: String!
        priceTypeCode: String!
        facetCode: String
        facetValueCode: String
        percent: Int!
        validFrom: DateTime!
        validTo: DateTime!
        minWeightKg: Float
        minAmount: Int
    }

    input DiscountRuleInput {
        erpId: String!
        priceTypeCode: String!
        facetCode: String
        facetValueCode: String
        percent: Int!
        validFrom: DateTime!
        validTo: DateTime!
        minWeightKg: Float
        minAmount: Int
    }

    extend type Mutation {
        upsertPriceEntry(variantId: ID!, priceTypeCode: String!, price: Int!): PriceEntry!
        bulkUpsertPriceEntries(entries: [PriceEntryInput!]!): Int!
        upsertDiscountRule(input: DiscountRuleInput!): DiscountRule!
        bulkUpsertDiscountRules(entries: [DiscountRuleInput!]!): Int!
    }
`;

@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [ProductVariantPriceEntry, DiscountRule],
    shopApiExtensions: {
        schema: shopApiSchema,
        resolvers: [ProductVariantPriceResolver, OrderLineDiscountResolver],
    },
    adminApiExtensions: {
        schema: adminApiSchema,
        resolvers: [PriceEntryAdminResolver, DiscountRuleAdminResolver],
    },
    providers: [
        PriceEntryService,
        DiscountRuleService,
        PriceResolutionService,
        TierRebalanceService,
    ],
    exports: [DiscountRuleService, PriceResolutionService],
    compatibility: '>0.0.0',
})
export class PriceEntryPlugin {}
