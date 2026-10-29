import { gql } from 'graphql-tag';

export const shopApiExtensions = gql`
    extend type Query {
        popularProductIds(take: Int): [ID!]!
        newArrivalProductIds(take: Int, sinceDays: Int): [ID!]!
        saleProductIds(take: Int): [ID!]!
    }
`;
