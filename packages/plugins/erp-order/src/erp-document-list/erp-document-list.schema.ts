import { gql } from 'graphql-tag';

export const erpDocumentListSchema = gql`
    "One ERP document row; names are resolved from the local catalogue, null when the soft link does not resolve."
    type ErpDocumentListItem {
        id: ID!
        number: String!
        date: DateTime
        counterpartyId: ID
        counterpartyName: String
        orderId: ID
        orderCode: String
        organizationName: String
        contractName: String
        currency: String
        amount: Money!
        comment: String
        lineCount: Int!
        "First products of the document by line order, at most three."
        productNames: [String!]!
    }

    type ErpDocumentPage {
        items: [ErpDocumentListItem!]!
        totalItems: Int!
    }

    type ErpDocumentCounts {
        customerClaims: Int!
        salesCorrections: Int!
        orderCorrections: Int!
        "Zero when asked by order only: a power of attorney belongs to a contract."
        powersOfAttorney: Int!
    }

    "Paging, search, filter and sort of an ERP document list; field names are a fixed whitelist."
    input ErpDocumentListInput {
        skip: Int
        take: Int
        "Substring match against the document number, the order code, the customer name and INN."
        search: String
        filter: ErpDocumentFilter
        sort: ErpDocumentSort
    }

    input ErpDocumentFilter {
        number: StringOperators
        date: DateOperators
        amount: NumberOperators
        customer: StringOperators
        customerInn: StringOperators
        counterpartyId: IDOperators
        orderCode: StringOperators
        orderId: IDOperators
        organization: StringOperators
        "Not available on order corrections."
        contract: StringOperators
        comment: StringOperators
        _and: [ErpDocumentFilter!]
    }

    input ErpDocumentSort {
        number: SortOrder
        date: SortOrder
        amount: SortOrder
        customer: SortOrder
    }

    extend type Query {
        visibleCustomerClaims(list: ErpDocumentListInput): ErpDocumentPage!
        visibleSalesCorrections(list: ErpDocumentListInput): ErpDocumentPage!
        visibleOrderCorrections(list: ErpDocumentListInput): ErpDocumentPage!
        "Visible documents of all three types tied to an order and/or a counterparty (local ids)."
        relatedErpDocumentCounts(orderId: ID, counterpartyId: ID): ErpDocumentCounts!
    }
`;
