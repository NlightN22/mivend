import { gql } from 'graphql-tag';

const lineChangeTypes = gql`
    type OrderLineChangeEvent {
        "realization, realization-correction or return; the client picks icon and wording by it"
        kind: String!
        titleKey: String!
        subtitleKey: String!
        "Signed, in the order line's unit"
        quantity: Float!
        "Quantity left after this event"
        remainder: Float!
        documentNumber: String!
        documentDate: DateTime
    }

    type OrderLineChange {
        orderLineId: ID!
        ordered: Float!
        "Ordered plus all shown events"
        actual: Float!
        events: [OrderLineChangeEvent!]!
    }
`;

export const shopLineChangesSchema = gql`
    ${lineChangeTypes}

    extend type Order {
        "Quantity changes after placing, only from documents reflected in accounting; never money"
        lineChanges: [OrderLineChange!]!
    }
`;

export const adminLineChangesSchema = gql`
    ${lineChangeTypes}

    extend type Order {
        "Every quantity change from the ERP documents, accounting-reflected or not"
        lineChanges: [OrderLineChange!]!
        "Order total after corrections and returns; null when the order has no changes"
        soldTotalWithTax: Money
    }
`;
