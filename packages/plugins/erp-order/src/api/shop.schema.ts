import { gql } from 'graphql-tag';

export const shopApiExtensions = gql`
    input MyOrdersListOptions {
        take: Int
        skip: Int
        search: String
        erpStatuses: [String!]
    }

    extend type Query {
        myOrders(options: MyOrdersListOptions): OrderList!
    }
`;
