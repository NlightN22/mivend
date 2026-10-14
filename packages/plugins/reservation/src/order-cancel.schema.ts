import type { DocumentNode } from 'graphql';
import gql from 'graphql-tag';

const resultTypes = gql`
    enum OrderCancelOutcome {
        CANCELLED
        CANCEL_REQUESTED
        ALREADY_CANCELLED
    }

    enum OrderCancelRefusalReason {
        SHIPPED
        IN_PROGRESS
        PAID
        REFUSED_BY_ERP
        REGISTRATION_REJECTED
    }

    type OrderCancelSuccess {
        outcome: OrderCancelOutcome!
    }

    type OrderCancelRefused {
        reason: OrderCancelRefusalReason!
        message: String!
    }

    union OrderCancelResult = OrderCancelSuccess | OrderCancelRefused

    extend type Order {
        "True while the customer or staff may still cancel this order."
        cancellable: Boolean!
    }
`;

export const shopCancelOrderSchema: DocumentNode = gql`
    ${resultTypes}

    extend type Mutation {
        "Cancel the active customer's own order; only while it is pending."
        cancelOrder(code: String!): OrderCancelResult!
    }
`;

export const adminCancelOrderSchema: DocumentNode = gql`
    ${resultTypes}

    extend type Mutation {
        "Cancel an order on behalf of staff; same condition as the customer."
        cancelOrderAsStaff(orderId: ID!): OrderCancelResult!
    }
`;
