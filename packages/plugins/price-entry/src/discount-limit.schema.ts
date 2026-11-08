import gql from 'graphql-tag';

export const discountLimitSchema = gql`
    type DiscountLimit {
        uuid: String!
        administratorId: ID!
        "all, manufacturer or category."
        scopeKind: String!
        "Empty for all products, else a manufacturer or category ERP id."
        scopeRef: String!
        maxDiscountPercent: Float!
    }

    """
    The current admin's ceiling for one order line; no row of theirs is a 0% ceiling.
    A null ceiling means the limit does not judge the line (a purely automatic discount).
    The discount percent is measured from the line's price without any manual or order-dependent discount.
    """
    type OrderLineDiscountLimit {
        orderLineId: ID!
        maxDiscountPercent: Float
        discountPercent: Float
    }

    type DiscountLimitScopeOption {
        ref: String!
        name: String!
    }

    extend type Query {
        "Selectable manufacturers or categories for a limit row; refs looks up names of known ids."
        discountLimitScopeOptions(
            scopeKind: String!
            search: String
            refs: [String!]
        ): [DiscountLimitScopeOption!]!
        discountLimits(administratorId: ID): [DiscountLimit!]!
        orderLineDiscountLimits(orderId: ID!): [OrderLineDiscountLimit!]!
    }

    extend type Mutation {
        setDiscountLimit(
            administratorId: ID!
            scopeKind: String!
            scopeRef: String
            maxDiscountPercent: Float!
        ): DiscountLimit!
        removeDiscountLimit(administratorId: ID!, scopeKind: String!, scopeRef: String): Boolean!
        """
        Raise the manual unit price of a placed order line toward its price without a discount. Never deepens a discount.
        """
        reduceOrderLineDiscount(
            orderId: ID!
            orderLineId: ID!
            targetUnitPrice: Int!
            justification: String
        ): Boolean!
        "Drop the manual price and return the line to automatic discounting. Always allowed."
        revertOrderLineDiscount(orderId: ID!, orderLineId: ID!): Boolean!
    }
`;
