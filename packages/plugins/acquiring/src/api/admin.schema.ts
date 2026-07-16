import { gql } from 'graphql-tag';
import type { DocumentNode } from 'graphql';

export const adminApiExtensions: DocumentNode = gql`
    type Invoice {
        id: ID!
        orderId: ID!
        organizationId: ID!
        counterpartyId: ID!
        amount: Int!
        currencyCode: String!
        status: String!
    }

    extend type Query {
        invoicesForOrder(orderId: ID!): [Invoice!]!
    }
`;
