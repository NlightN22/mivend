import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import gql from 'graphql-tag';

import { CrossReferenceService } from './cross-reference.service';
import { ProductCrossReference } from './entities/product-cross-reference.entity';
import { CrossReferenceAdminResolver } from './cross-reference.resolver';

const adminApiSchema = gql`
    type ProductCrossReference {
        id: ID!
        productId: ID!
        oemCode: String!
        oemBrand: String!
    }

    extend type Query {
        productCrossReferences(productId: ID!): [ProductCrossReference!]!
    }
`;

@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [ProductCrossReference],
    providers: [CrossReferenceService],
    exports: [CrossReferenceService],
    adminApiExtensions: {
        schema: adminApiSchema,
        resolvers: [CrossReferenceAdminResolver],
    },
    compatibility: '>0.0.0',
})
export class CrossReferencePlugin {}
