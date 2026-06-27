import {
    LanguageCode,
    PluginCommonModule,
    RuntimeVendureConfig,
    VendurePlugin,
} from '@vendure/core';
import gql from 'graphql-tag';

import { CounterpartyConsumer } from './consumers/counterparty.consumer';
import { TradingPointConsumer } from './consumers/trading-point.consumer';
import { Counterparty } from './entities/counterparty.entity';
import { ContactPerson } from './entities/contact-person.entity';
import { TradingPoint } from './entities/trading-point.entity';
import { CustomerCounterpartyResolver, CounterpartyResolver } from './counterparty.resolver';
import {
    CustomerTradingPointResolver,
    CounterpartyTradingPointResolver,
    TradingPointResolver,
    TradingPointAdminResolver,
    CustomerTradingPointsQueryResolver,
    CustomerTradingPointsMutationResolver,
} from './trading-point.resolver';
import { CounterpartyService } from './counterparty.service';
import { TradingPointService } from './trading-point.service';

const tradingPointFields = gql`
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
        contacts: [ContactPerson!]!
    }
`;

const shopApiSchema = gql`
    ${tradingPointFields}

    type Counterparty {
        id: ID!
        erpId: String!
        legalName: String!
        shortName: String!
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

const adminApiSchema = gql`
    ${tradingPointFields}

    type Counterparty {
        id: ID!
        erpId: String!
        legalName: String!
        shortName: String!
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
        counterparties: [Counterparty!]!
        tradingPoint(id: ID!): TradingPoint
    }

    extend type Mutation {
        upsertCounterparty(
            erpId: String!
            legalName: String!
            shortName: String!
            inn: String
            creditLimit: Int!
            creditBalance: Int!
            paymentDelayDays: Int!
            priceType: String!
            isActive: Boolean!
        ): Counterparty!

        assignCustomerToCounterparty(customerId: ID!, erpId: String!, role: String!): Boolean!

        upsertTradingPoint(
            erpId: String!
            counterpartyErpId: String!
            name: String!
            address: String!
            latitude: Float
            longitude: Float
            workingHours: String
            isActive: Boolean!
        ): TradingPoint!

        updateTradingPointComment(tradingPointId: ID!, comment: String): TradingPoint!
        setPreferredTradingPoint(tradingPointId: ID!): Boolean!
    }
`;

const shopResolvers = [
    CustomerCounterpartyResolver,
    CustomerTradingPointResolver,
    CounterpartyTradingPointResolver,
    TradingPointResolver,
    CustomerTradingPointsQueryResolver,
    CustomerTradingPointsMutationResolver,
];

const adminResolvers = [...shopResolvers, CounterpartyResolver, TradingPointAdminResolver];

@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [Counterparty, TradingPoint, ContactPerson],
    shopApiExtensions: {
        schema: shopApiSchema,
        resolvers: shopResolvers,
    },
    adminApiExtensions: {
        schema: adminApiSchema,
        resolvers: adminResolvers,
    },
    providers: [
        CounterpartyService,
        CounterpartyConsumer,
        TradingPointService,
        TradingPointConsumer,
    ],
    configuration: (config: RuntimeVendureConfig) => {
        config.customFields.Customer = [
            ...(config.customFields.Customer ?? []),
            {
                name: 'counterpartyId',
                type: 'string' as const,
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Counterparty ID' }],
            },
            {
                name: 'portalRole',
                type: 'string' as const,
                nullable: true,
                defaultValue: 'buyer',
                label: [{ languageCode: LanguageCode.en, value: 'Portal role' }],
            },
            {
                name: 'preferredTradingPointId',
                type: 'string' as const,
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Preferred trading point ID' }],
            },
        ];
        return config;
    },
    compatibility: '>0.0.0',
})
export class CounterpartyPlugin {}
