import { gql } from 'graphql-tag';
import type { DocumentNode } from 'graphql';

export const shopApiExtensions: DocumentNode = gql`
    type ProductManufacturer {
        id: ID!
        name: String
    }

    type PackagingLevel {
        name: String!
        ratioToBase: Float!
    }

    extend type Product {
        manufacturer: ProductManufacturer
        "Product-owned packaging units (pack, pallet), smallest first."
        packagingLevels: [PackagingLevel!]!
    }

    extend type SearchResult {
        manufacturer: ProductManufacturer
        "Preview URLs of all the product's photos in gallery order (max 10), for catalog carousels."
        galleryPreviews: [String!]!
        "Name and ratio to base of the variant's default sales unit."
        unitName: String
        unitRatioToBase: Float
        "Product-owned packaging units (pack, pallet), smallest first."
        packagingLevels: [PackagingLevel!]!
        "Order quantity step of the variant, in base units."
        multiplicity: Int
    }
`;
