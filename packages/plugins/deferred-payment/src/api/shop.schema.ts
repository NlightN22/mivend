import { gql } from 'graphql-tag';

export const shopApiExtensions = gql`
    type DeferredCreditPreview {
        exceeded: Boolean!
        availableCredit: Float!
        orderAmount: Float!
        "Limit control applies: the counterparty has a credit limit and payment delay days."
        limitControlled: Boolean!
        "The branch lets an over-limit order go on after the customer acknowledges it."
        allowExceedingCreditLimit: Boolean!
        "Checkout must show the over-limit warning and an acknowledgement."
        acknowledgementRequired: Boolean!
        "What an online card payment is created for: existing excess over the limit plus the order total."
        payableCardAmount: Float!
        "Payment forms the customer can choose: cash, bank-transfer, card."
        availableForms: [String!]!
    }

    extend type Query {
        deferredCreditPreview: DeferredCreditPreview!
    }
`;
