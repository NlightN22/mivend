import { gql } from 'graphql-tag';

export const shopApiExtensions = gql`
    type SettlementOrderRef {
        orderId: ID
        orderCode: String
        orderErpId: String!
        amount: Money!
    }

    type SettlementDocumentRow {
        id: ID!
        documentType: String!
        documentTypeLabel: String!
        category: String!
        number: String!
        date: DateTime!
        organizationId: String!
        organizationName: String
        contractId: String
        contractName: String
        currency: String!
        amount: Money!
        dueDate: DateTime
        paymentStatus: String
        orders: [SettlementOrderRef!]!
    }

    type SettlementDocumentPage {
        items: [SettlementDocumentRow!]!
        totalItems: Int!
    }

    type SettlementBalanceCard {
        organizationId: String!
        organizationName: String
        contractId: String
        contractName: String
        currency: String!
        openingBalance: Money!
        currentBalance: Money!
        overdue: Money!
    }

    input SettlementDocumentFilter {
        contractId: String
        organizationId: String
        dateFrom: String
        dateTo: String
        search: String
        category: String
        overdueOnly: Boolean
    }

    extend type Query {
        settlementDocuments(
            filter: SettlementDocumentFilter
            skip: Int
            take: Int
        ): SettlementDocumentPage!
        settlementBalances(contractId: String, organizationId: String): [SettlementBalanceCard!]!
    }
`;
