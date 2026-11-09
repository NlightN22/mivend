import gql from 'graphql-tag';

export const adminApiSchema = gql`
    extend type Query {
        visibleOrders(
            options: OrderListOptions
            managerId: ID
            customerId: ID
            search: String
        ): OrderList!
        "Sum of totalWithTax over the caller's visible orders matching options.filter"
        visibleOrdersAmount(options: OrderListOptions): Money!
        "Orders needing attention in one request: pending price adjustment (waiting), overdue shipment (overdueRows) and their intersection (both)"
        ordersAttention(overdueBefore: DateTime!): OrdersAttention!
        "Latest placed-order date per listed counterparty, visible orders only"
        lastOrderDates(counterpartyIds: [ID!]!): [CounterpartyLastOrder!]!
        orderStatuses: [OrderStatusInfo!]!
    }

    extend type Order {
        "The order's own counterparty, else its customer's"
        counterparty: Counterparty
    }

    type OrdersAttention {
        waiting: OrderList!
        overdueRows: OrderList!
        both: OrdersAttentionCount!
        pendingPriceAdjustmentOrderIds: [String!]!
    }

    type OrdersAttentionCount {
        totalItems: Int!
    }

    type CounterpartyLastOrder {
        counterpartyId: ID!
        lastOrderAt: DateTime!
    }

    type OrderStatusInfo {
        code: String!
        name: String!
        description: String!
        rank: Int!
        customerGroup: String!
        customerVisible: Boolean!
        terminal: Boolean!
        warehouseStarted: Boolean!
        shipped: Boolean!
        delivered: Boolean!
        cancelled: Boolean!
        rejected: Boolean!
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

    extend type Order {
        statusHistory: [OrderStatusHistoryEntry!]!
    }

    extend type Mutation {
        "Staff pick one of the order client's trading points on a draft order; null means self-pickup."
        setDraftOrderTradingPoint(orderId: ID!, tradingPointId: ID): Boolean!
    }
`;
