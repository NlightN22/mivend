import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import gql from 'graphql-tag';

import { ProductVariantPriceEntry } from './price-entry.entity';
import { DiscountRule } from './discount-rule.entity';
import {
    DiscountRuleAdminResolver,
    PriceEntryAdminResolver,
    ProductVariantPriceResolver,
} from './price-entry.resolver';
import { PriceEntryService } from './price-entry.service';
import { DiscountRuleService } from './discount-rule.service';
import { PriceResolutionService } from './price-resolution.service';

const shopApiSchema = gql`
    extend type ProductVariant {
        customerPrice: Int
        compareAtPrice: Int
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
        resolvers: [ProductVariantPriceResolver],
    },
    adminApiExtensions: {
        schema: adminApiSchema,
        resolvers: [PriceEntryAdminResolver, DiscountRuleAdminResolver],
    },
    providers: [PriceEntryService, DiscountRuleService, PriceResolutionService],
    exports: [DiscountRuleService, PriceResolutionService],
    compatibility: '>0.0.0',
})
export class PriceEntryPlugin {}
