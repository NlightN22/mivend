import { gql } from 'graphql-tag';

export const adminApiExtensions = gql`
    "Overdue debt of one counterparty over all its customer contracts; oldestDays is null when no due date is known."
    type CounterpartyOverdue {
        amount: Money!
        currency: String!
        oldestDays: Int
    }

    "One signed effect of an ERP document on a customer's settlement (positive increases the customer's debt)."
    type SettlementListItem {
        id: ID!
        documentType: String!
        documentTypeLabel: String!
        category: String!
        number: String!
        date: DateTime!
        counterpartyId: ID
        counterpartyShortName: String
        organizationId: String!
        organizationName: String
        contractId: String
        contractName: String
        currencyCode: String!
        amount: Money!
        "Local orders the document refers to, when the soft link resolves."
        orderCodes: [String!]!
        "The proforma invoice that was issued for this sales invoice, if any."
        proformaInvoiceNumber: String
    }

    type SettlementListPage {
        items: [SettlementListItem!]!
        totalItems: Int!
    }

    type SettlementTypeCount {
        documentType: String!
        label: String!
        count: Int!
    }

    input SettlementListOptions {
        take: Int
        skip: Int
        "Exact document type code (the chips); the filter below narrows further."
        documentType: String
        "Substring match against the document number, the customer name and INN, and the order codes."
        search: String
        filter: SettlementFilterParameter
        sort: SettlementSortParameter
    }

    "Filtered on the server inside the caller's visible set; field names are a fixed whitelist."
    input SettlementFilterParameter {
        documentType: StringOperators
        "Document type label."
        typeLabel: StringOperators
        number: StringOperators
        date: DateOperators
        amount: NumberOperators
        customer: StringOperators
        customerInn: StringOperators
        counterpartyId: IDOperators
        contract: StringOperators
        contractId: StringOperators
        organization: StringOperators
        organizationId: StringOperators
        orderCode: StringOperators
        proformaInvoiceNumber: StringOperators
        _and: [SettlementFilterParameter!]
        _or: [SettlementFilterParameter!]
    }

    input SettlementSortParameter {
        typeLabel: SortOrder
        number: SortOrder
        date: SortOrder
        amount: SortOrder
        customer: SortOrder
    }

    extend type Query {
        counterpartyOverdue(counterpartyId: ID!): CounterpartyOverdue
        "Manager-portal settlement documents of the customers the caller may see; needs ReadCounterpartyCredit."
        visibleSettlementDocuments(
            options: SettlementListOptions
            counterpartyId: ID
        ): SettlementListPage!
        "Document counts per type for the same search and filter (the type itself is ignored), for the type chips."
        visibleSettlementTypeCounts(
            options: SettlementListOptions
            counterpartyId: ID
        ): [SettlementTypeCount!]!
    }
`;
