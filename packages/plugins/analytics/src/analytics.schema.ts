import type { DocumentNode } from 'graphql';
import gql from 'graphql-tag';

export const adminApiSchema: DocumentNode = gql`
    type AnalyticsReport {
        key: String!
        title: String!
        description: String!
        area: String!
        status: String!
        note: String!
    }

    enum OrderAnalyticsGranularity {
        NONE
        DAY
        MONTH
    }

    enum OrderAnalyticsDimension {
        NONE
        CUSTOMER
        ORGANIZATION
        POINT_OF_SALE
        MANAGER
    }

    enum OrderAnalyticsState {
        OK
        NOT_CONFIGURED
        TOO_LARGE
        UNAVAILABLE
    }

    input OrderAnalyticsInput {
        from: DateTime!
        to: DateTime!
        granularity: OrderAnalyticsGranularity!
        dimension: OrderAnalyticsDimension!
        timeZone: String
        "A card pins its entity; the id is mivend's, the ERP id never reaches the browser."
        counterpartyId: ID
        administratorId: ID
    }

    type OrderAnalyticsRow {
        periodStart: DateTime
        dimensionId: String!
        label: String!
        currency: String!
        turnover: String!
        turnoverExcludingVat: String!
        vatTotal: String!
        orderCount: Int!
        ordersWithoutAmount: Int!
    }

    type OrderAnalytics {
        state: OrderAnalyticsState!
        rows: [OrderAnalyticsRow!]!
        limitedToVisibleCustomers: Boolean!
    }

    extend type Query {
        analyticsReports: [AnalyticsReport!]!
        orderAnalytics(input: OrderAnalyticsInput!): OrderAnalytics!
    }
`;
