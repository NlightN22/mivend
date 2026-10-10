import type { DocumentNode } from 'graphql';
import gql from 'graphql-tag';

const resultTypes = gql`
    enum CancelOrderOutcome {
        CANCELLED
        CANCEL_REQUESTED
        ALREADY_CANCELLED
        LEFT_TO_ERP
    }

    enum CancelOrderRefusalReason {
        SHIPPED
        IN_PROGRESS
        PAID
        REFUSED_BY_ERP
        REGISTRATION_REJECTED
    }

    type CancelOrderSuccess {
        outcome: CancelOrderOutcome!
    }

    type CancelOrderRefused {
        reason: CancelOrderRefusalReason!
        message: String!
    }

    union CancelOrderResult = CancelOrderSuccess | CancelOrderRefused
`;

export const shopCancelOrderSchema: DocumentNode = gql`
    ${resultTypes}

    extend type Mutation {
        "Cancel the active customer's own order; only while it is pending."
        cancelOrder(code: String!): CancelOrderResult!
    }
`;

export const adminCancelOrderSchema: DocumentNode = gql`
    ${resultTypes}

    extend type Mutation {
        "Cancel an order on behalf of staff; same condition as the customer."
        cancelOrder(orderId: ID!): CancelOrderResult!
    }
`;
