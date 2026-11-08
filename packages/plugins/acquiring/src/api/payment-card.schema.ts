import { gql } from 'graphql-tag';
import type { DocumentNode } from 'graphql';

export const paymentCardSchema: DocumentNode = gql`
    type PaymentCardCustomer {
        id: ID!
        shortName: String
        inn: String
    }

    type PaymentCardProforma {
        id: ID!
        number: String!
        version: Int!
        amount: Int!
        currencyCode: String!
        "current | superseded | cancelled; never the stored status."
        displayStatus: String!
        dueDate: DateTime!
    }

    type PaymentCardOrder {
        code: String!
        state: String!
        orderTotal: Int!
        currencyCode: String!
    }

    type PaymentCardRefund {
        id: ID!
        number: String!
        amount: Int!
        status: String!
        reason: String!
        createdAt: DateTime!
    }

    "Manager payment card: one visible payment with its customer, proforma invoice, order and the 50 newest refunds."
    type PaymentCard {
        id: ID!
        number: String!
        createdAt: DateTime!
        channel: String!
        paymentStatus: String!
        amount: Int!
        currencyCode: String!
        providerPaymentId: String!
        customer: PaymentCardCustomer
        proformaInvoice: PaymentCardProforma
        order: PaymentCardOrder
        refunds: [PaymentCardRefund!]!
    }

    extend type Query {
        "One payment card by id, scoped like visiblePayments; a foreign, unknown or malformed id is null."
        payment(id: ID!): PaymentCard
    }
`;
