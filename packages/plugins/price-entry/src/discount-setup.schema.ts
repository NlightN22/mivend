import gql from 'graphql-tag';

export const discountSetupSchema = gql`
    enum DiscountSetupSortField {
        documentNumber
        validFrom
        validTo
        percent
    }

    input DiscountSetupSort {
        field: DiscountSetupSortField!
        direction: SortOrder!
    }

    input DiscountSetupListOptions {
        skip: Int
        take: Int
        "Document number (displayed or stored form) or a visible recipient's legal or short name."
        search: String
        "running | expiring-soon | upcoming | expired | inactive; disjoint, so the counts add up."
        status: String
        "Only setups naming this counterparty, plus the ones that apply to everyone."
        counterpartyId: ID
        "Default: validFrom descending, then id descending."
        sort: DiscountSetupSort
    }

    type DiscountSetupCounterparty {
        "Null when the recipient counterparty is not imported."
        id: ID
        name: String!
        contractErpId: String
    }

    "One ERP discount setup document; ERP-owned, identified by its document number."
    type DiscountSetupRow {
        id: ID!
        documentNumber: String!
        "Negative is a markup."
        percent: Float!
        validFrom: DateTime!
        validTo: DateTime
        status: String!
        inactiveReason: String
        priceTypeCode: String
        allProducts: Boolean!
        "list or filter"
        productMode: String!
        "Listed products; 0 for all products or a filter-mode selection."
        productCount: Int!
        "Only the recipients inside the caller's counterparty scope."
        counterparties: [DiscountSetupCounterparty!]!
        "Distinct recipient counterparties in total, in scope or not; 0 = applies to everyone."
        recipientCount: Int!
    }

    type DiscountSetupList {
        items: [DiscountSetupRow!]!
        totalItems: Int!
    }

    type DiscountSetupCounts {
        all: Int!
        running: Int!
        expiringSoon: Int!
        upcoming: Int!
        expired: Int!
        inactive: Int!
    }

    extend type Query {
        discountSetups(options: DiscountSetupListOptions): DiscountSetupList!
        discountSetupCounts(counterpartyId: ID): DiscountSetupCounts!
    }
`;
