import gql from 'graphql-tag';

export const adminOrderDeliveryEditSchema = gql`
    enum OrderDeliveryMethod {
        PICKUP
        COURIER
    }

    extend type Mutation {
        "Staff change of the delivery method and point of a placed order until it is sent to the ERP (#245); needs ConfirmOrder."
        setOrderDelivery(orderId: ID!, method: OrderDeliveryMethod!, tradingPointId: ID): Boolean!
    }
`;
