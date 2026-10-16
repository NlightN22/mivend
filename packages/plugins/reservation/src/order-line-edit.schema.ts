import gql from 'graphql-tag';

export const adminOrderLineEditSchema = gql`
    type OrderLineWarehouseStock {
        warehouseErpId: String!
        name: String
        free: Int!
    }

    type OrderLineOrganizationStock {
        id: String!
        name: String
        stock: Float!
        hasContract: Boolean!
        selling: Boolean!
    }

    type OrderLineAvailability {
        orderLineId: ID!
        needed: Int!
        "What the warehouse and the line's own organization can cover now."
        available: Int!
        "available capped at the ordered quantity."
        fitting: Int!
        "warehouse | organization, null when the line is fully covered."
        limitedBy: String
        "The pack multiple the quantity must respect."
        step: Int!
        warehouses: [OrderLineWarehouseStock!]!
        organizations: [OrderLineOrganizationStock!]!
    }

    type OrderLineSplitOutcome {
        orderLineId: ID!
        requested: Int!
        kept: Int!
        shortfall: Int!
    }

    extend type Query {
        "Stock that applies to each line, per warehouse and per organization (#233). Needs ReadOrder."
        orderLineAvailability(orderId: ID!): [OrderLineAvailability!]!
    }

    extend type Mutation {
        "Staff edits before confirmation (#233); need ConfirmOrder, refused after a reservation, ERP registration or payment."
        changeOrderLineQuantity(orderId: ID!, orderLineId: ID!, quantity: Int!): Boolean!
        removeOrderLine(orderId: ID!, orderLineId: ID!): Boolean!
        "Cuts the short lines to what stock covers and records the rest as shortfall."
        splitOrderLinesByStock(orderId: ID!): [OrderLineSplitOutcome!]!
    }
`;
