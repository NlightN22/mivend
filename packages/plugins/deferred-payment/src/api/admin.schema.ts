import { gql } from 'graphql-tag';

export const adminApiExtensions = gql`
    extend type Order {
        creditLimitExceeded: Boolean!
    }

    extend type Query {
        creditLimitExceededCounterpartyIds: [ID!]!
    }
`;
