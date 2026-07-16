import { gql } from 'graphql-tag';
import type { DocumentNode } from 'graphql';

export const shopApiExtensions: DocumentNode = gql`
    type Invoice {
        id: ID!
        orderId: ID!
        organizationId: ID!
        amount: Int!
        currencyCode: String!
        status: String!
    }

    extend type Query {
        # Scoped to orders owned by the current customer — see AcquiringShopResolver.
        myInvoices(orderId: ID!): [Invoice!]!
    }
`;
