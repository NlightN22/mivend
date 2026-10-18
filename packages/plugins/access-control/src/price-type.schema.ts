export const priceTypeSdl = `
    type PriceType {
        id: ID!
        code: String!
        name: String!
        isActive: Boolean!
        visibility: String!
    }

    extend type Customer {
        priceType: PriceType
    }

    extend type Query {
        priceTypes: [PriceType!]!
    }

    extend type Mutation {
        upsertPriceType(code: String!, name: String!): PriceType!
    }
`;
