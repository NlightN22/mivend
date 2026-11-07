import gql from 'graphql-tag';

export const discountLimitSchema = gql`
    type DiscountLimit {
        uuid: String!
        roleCode: String!
        "Empty for every product, else a manufacturer or category ERP id."
        groupRef: String!
        maxDiscountPercent: Float!
    }

    """
    The current admin's ceiling for one order line. A null ceiling means no limit is set for them.
    The discount percent is measured from the line's price without any manual or order-dependent discount.
    """
    type OrderLineDiscountLimit {
        orderLineId: ID!
        maxDiscountPercent: Float
        discountPercent: Float
    }

    extend type Query {
        discountLimits: [DiscountLimit!]!
        orderLineDiscountLimits(orderId: ID!): [OrderLineDiscountLimit!]!
    }

    extend type Mutation {
        setDiscountLimit(
            roleCode: String!
            groupRef: String
            maxDiscountPercent: Float!
        ): DiscountLimit!
        removeDiscountLimit(roleCode: String!, groupRef: String): Boolean!
        """
        Raise a placed order line's unit price toward its price without a discount. Never deepens a discount.
        """
        reduceOrderLineDiscount(
            orderId: ID!
            orderLineId: ID!
            targetUnitPrice: Int!
            justification: String
        ): Boolean!
        "Return a manually priced line to automatic discounting, if that fits the admin's discount limit."
        revertOrderLineDiscount(orderId: ID!, orderLineId: ID!): Boolean!
    }
`;
