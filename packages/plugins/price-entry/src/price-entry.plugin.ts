import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import gql from 'graphql-tag';

import { ProductVariantPriceEntry } from './price-entry.entity';
import { PriceEntryAdminResolver, ProductVariantPriceResolver } from './price-entry.resolver';
import { PriceEntryService } from './price-entry.service';

const shopApiSchema = gql`
    extend type ProductVariant {
        customerPrice: Int
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

    extend type Mutation {
        upsertPriceEntry(variantId: ID!, priceTypeCode: String!, price: Int!): PriceEntry!
        bulkUpsertPriceEntries(entries: [PriceEntryInput!]!): Int!
    }
`;

@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [ProductVariantPriceEntry],
    shopApiExtensions: {
        schema: shopApiSchema,
        resolvers: [ProductVariantPriceResolver],
    },
    adminApiExtensions: {
        schema: adminApiSchema,
        resolvers: [PriceEntryAdminResolver],
    },
    providers: [PriceEntryService],
    compatibility: '>0.0.0',
})
export class PriceEntryPlugin {}
