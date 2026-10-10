// GraphQL SDL fragment of the admin API extension (combined in admin.schema.ts).
export const photoTypes = `
    "A product photo that is not downloaded yet (pending) or gave up (failed) — issue #181."
    type ProductPhoto implements Node {
        id: ID!
        updatedAt: DateTime!
        externalId: String!
        productExternalId: String!
        position: Int!
        status: String!
        lastError: String
        replayAttempts: Int!
        lastReplayAt: DateTime
    }

    type ProductPhotoList implements PaginatedList {
        items: [ProductPhoto!]!
        totalItems: Int!
    }

    input ProductPhotoFilterParameter {
        externalId: StringOperators
        productExternalId: StringOperators
        status: StringOperators
    }

    input ProductPhotoSortParameter {
        externalId: SortOrder
        productExternalId: SortOrder
        status: SortOrder
        updatedAt: SortOrder
        replayAttempts: SortOrder
    }

    input ProductPhotoListOptions {
        skip: Int
        take: Int
        sort: ProductPhotoSortParameter
        filter: ProductPhotoFilterParameter
        filterOperator: LogicalOperator
    }

`;
