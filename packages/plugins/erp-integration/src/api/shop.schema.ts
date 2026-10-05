import { gql } from 'graphql-tag';
import type { DocumentNode } from 'graphql';

export const shopApiExtensions: DocumentNode = gql`
    type ProductManufacturer {
        id: ID!
        name: String
    }

    extend type Product {
        manufacturer: ProductManufacturer
    }

    extend type SearchResult {
        manufacturer: ProductManufacturer
    }
`;
