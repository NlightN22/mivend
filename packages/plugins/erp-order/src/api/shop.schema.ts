import { gql } from 'graphql-tag';

// Uses Vendure's own OrderListOptions/OrderList; `search` is a bare arg because it is not a real Order column (backend-plugin-rules skill).
export const shopApiExtensions = gql`
    extend type Query {
        myOrders(options: OrderListOptions, search: String): OrderList!
        orderStatuses: [OrderStatusInfo!]!
    }

    type OrderStatusHistoryEntry {
        uuid: String!
        previousStatus: String
        status: String!
        occurredAt: DateTime!
        reference: OrderStatusReferenceInfo
    }

    type OrderStatusReferenceInfo {
        code: String!
        name: String!
        description: String!
        customerVisible: Boolean!
    }

    type OrderStatusInfo {
        code: String!
        name: String!
        description: String!
        customerGroup: String!
        terminal: Boolean!
        cancelled: Boolean!
        rejected: Boolean!
        customerVisible: Boolean!
    }

    extend type Order {
        statusHistory: [OrderStatusHistoryEntry!]!
    }
`;
