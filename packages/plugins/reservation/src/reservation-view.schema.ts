import type { DocumentNode } from 'graphql';
import gql from 'graphql-tag';

export const shopReservationViewSchema: DocumentNode = gql`
    extend type OrderLine {
        "True while stock for this line is held for the customer, by us or by the ERP."
        reserved: Boolean!
        "Earliest end of the hold, when known."
        reservedUntil: DateTime
    }
`;

export const adminReservationViewSchema: DocumentNode = gql`
    enum ReservationSource {
        LOCAL
        ERP
    }

    type OrderReservationDetail {
        orderLineId: ID!
        productVariantId: ID!
        sku: String!
        source: ReservationSource!
        quantity: Int!
        until: DateTime
        status: String!
    }

    type VariantReservationHolder {
        orderId: ID!
        orderCode: String!
        counterpartyName: String
        managerName: String
        source: ReservationSource!
        quantity: Int!
        until: DateTime
    }

    extend type Query {
        "Every hold behind an order's lines: our own reservation rows and what the ERP reports."
        orderReservationDetails(orderId: ID!): [OrderReservationDetail!]!
        "Visible orders that currently hold stock of this variant, earliest expiry first (#112)."
        variantReservationHolders(productVariantId: ID!): [VariantReservationHolder!]!
    }
`;
