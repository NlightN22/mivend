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

    type SettlementDocumentTypeInfo {
        documentType: String!
        label: String!
        category: String
        "Whether the type's amounts count toward customer turnover (sales, sales corrections, returns)."
        movesTurnover: Boolean!
    }

    "Amount of one currency, minor units."
    type CurrencyAmount {
        currency: String!
        amountMinor: Money!
    }

    "One settlement balance row of a counterparty; contractName is null when the contract is not imported."
    type CounterpartyContractBalance {
        contractId: String
        contractErpId: String!
        contractName: String
        organizationName: String
        currency: String!
        closingBalanceMinor: Money!
        openingDate: DateTime
    }

    """
    Real ledger figures of one counterparty. Positive balance = the counterparty owes us. Totals and turnover are in
    `currency` (the currency with the largest absolute balance); `balances` lists every currency.
    """
    type CounterpartyMetrics {
        currency: String!
        balanceMinor: Money!
        balances: [CurrencyAmount!]!
        contractBalances: [CounterpartyContractBalance!]!
        salesLast30DaysMinor: Money!
        salesPrev30DaysMinor: Money!
        salesLast12MonthsMinor: Money!
        saleDocumentsLast12Months: Int!
        "Net turnover of 12 months per sale document; null when there is no sale document."
        averageCheckMinor: Money
        openOrdersCount: Int!
        computedAt: DateTime!
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
        "Balance, turnover and open orders of one counterparty; null when it is outside the caller's scope; needs the credit right."
        counterpartyMetrics(counterpartyId: ID!): CounterpartyMetrics
        "Manager-portal settlement documents of the customers the caller may see; needs ReadSettlementDocument."
        visibleSettlementDocuments(
            options: SettlementListOptions
            counterpartyId: ID
        ): SettlementListPage!
        "Document counts per type for the same search and filter (the type itself is ignored), for the type chips."
        visibleSettlementTypeCounts(
            options: SettlementListOptions
            counterpartyId: ID
        ): [SettlementTypeCount!]!
        "Every document type known to the system (registry plus types seen only on documents), no counts; needs ReadSettlementDocument."
        settlementDocumentTypes: [SettlementDocumentTypeInfo!]!
        "Typeahead values (up to limit, at most 20) for a filter field that starts with the prefix (2+ characters), from the documents the caller may list; field is one of customer, number."
        settlementFilterSuggestions(field: String!, prefix: String!, limit: Int): [String!]!
    }
`;
