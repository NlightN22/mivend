import gql from 'graphql-tag';

export const tradingPointFields = gql`
    type ContactPerson {
        id: ID!
        name: String!
        phone: String
        email: String
        isPrimary: Boolean!
    }

    type TradingPoint {
        id: ID!
        erpId: String!
        name: String!
        address: String!
        latitude: Float
        longitude: Float
        workingHours: String
        deliveryComment: String
        isActive: Boolean!
        customerStatus: String!
        customerOwned: Boolean!
        servicingBranchId: String
        contacts: [ContactPerson!]!
    }
`;

export const shopApiSchema = gql`
    ${tradingPointFields}

    type Counterparty {
        id: ID!
        erpId: String!
        fullName: String
        inn: String
        creditLimit: Int!
        creditBalance: Int!
        paymentDelayDays: Int!
        priceType: String!
        isActive: Boolean!
        tradingPoints: [TradingPoint!]!
    }

    extend type Customer {
        counterparty: Counterparty
        preferredTradingPoint: TradingPoint
    }

    extend type Query {
        tradingPoint(id: ID!): TradingPoint
        myTradingPoints: [TradingPoint!]!
        myHiddenTradingPoints: [TradingPoint!]!
    }

    extend type Mutation {
        setPreferredTradingPoint(tradingPointId: ID!): Boolean!
        updateTradingPointComment(tradingPointId: ID!, comment: String): TradingPoint!
        customerAddTradingPoint(
            name: String!
            address: String!
            workingHours: String
            deliveryComment: String
            contactName: String
            contactPhone: String
        ): TradingPoint
        customerEditTradingPoint(
            id: ID!
            name: String!
            address: String!
            workingHours: String
            deliveryComment: String
            contactName: String
            contactPhone: String
        ): TradingPoint
        customerDeleteTradingPoint(id: ID!): Boolean!
        customerRestoreTradingPoint(id: ID!): TradingPoint
    }
`;
