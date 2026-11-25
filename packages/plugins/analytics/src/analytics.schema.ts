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
        COUNTERPARTY_MANAGER
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
        "Names typed in the filter builder; the server resolves them to ids inside the viewer's scope."
        entityFilters: [OrderAnalyticsEntityFilterInput!]
        "Limits counterparty-manager filter and dimension to the main manager of a counterparty."
        mainManagerOnly: Boolean
    }

    enum OrderAnalyticsFilterKind {
        CUSTOMER
        ORGANIZATION
        CONTRACT
        POINT_OF_SALE
        MANAGER
        COUNTERPARTY_MANAGER
        PRODUCT
        MANUFACTURER
    }

    input OrderAnalyticsEntityFilterInput {
        kind: OrderAnalyticsFilterKind!
        values: [String!]!
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
        "Filled only when a product or manufacturer filter is set; the amounts above are then empty."
        productQuantity: String!
        productAmount: String!
        productLinesWithoutAmount: Int!
    }

    type OrderAnalytics {
        state: OrderAnalyticsState!
        rows: [OrderAnalyticsRow!]!
        limitedToVisibleCustomers: Boolean!
    }

    enum SalesAnalyticsDimension {
        NONE
        COUNTERPARTY
        ORGANIZATION
        CONTRACT
        COUNTERPARTY_MANAGER
    }

    input SalesAnalyticsInput {
        from: DateTime!
        to: DateTime!
        granularity: OrderAnalyticsGranularity!
        dimension: SalesAnalyticsDimension!
        timeZone: String
        "Names typed in the filter builder; the server resolves them to ids inside the viewer's scope."
        entityFilters: [OrderAnalyticsEntityFilterInput!]
        mainManagerOnly: Boolean
    }

    type SalesAnalyticsAmount {
        amount: String!
        amountExcludingVatBasis: String!
        documentCount: Int!
        documentsWithoutAmount: Int!
    }

    type SalesAnalyticsRow {
        periodStart: DateTime
        dimensionId: String!
        label: String!
        currency: String!
        sales: SalesAnalyticsAmount!
        returns: SalesAnalyticsAmount!
        corrections: SalesAnalyticsAmount!
        netSales: SalesAnalyticsAmount!
    }

    type SalesAnalytics {
        state: OrderAnalyticsState!
        rows: [SalesAnalyticsRow!]!
        correctionsWithoutEffect: Int!
        unresolvedCurrencies: [String!]!
        limitedToVisibleCustomers: Boolean!
    }

    extend type Query {
        salesAnalytics(input: SalesAnalyticsInput!): SalesAnalytics!
        analyticsReports: [AnalyticsReport!]!
        orderAnalytics(input: OrderAnalyticsInput!): OrderAnalytics!
        orderAnalyticsSuggest(kind: OrderAnalyticsFilterKind!, prefix: String!): [String!]!
    }
`;
