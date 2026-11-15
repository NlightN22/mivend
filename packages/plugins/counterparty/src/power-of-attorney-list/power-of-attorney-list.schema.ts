import { gql } from 'graphql-tag';

export const powerOfAttorneyListSchema = gql`
    "One power of attorney row from the ERP contract; the scan is only indicated, the file is not delivered."
    type PowerOfAttorneyListItem {
        id: ID!
        number: String!
        holderName: String!
        validFrom: DateTime
        validUntil: DateTime
        "active or expired, computed from the validity end date."
        status: String!
        scanId: String
        hasScan: Boolean!
        contractId: ID
        contractName: String
        counterpartyId: ID
        counterpartyName: String
        "True when the ERP deleted the contract; such rows are returned only to holders of ReadDeletedContractPowerOfAttorney."
        contractDeleted: Boolean!
    }

    type PowerOfAttorneyPage {
        items: [PowerOfAttorneyListItem!]!
        totalItems: Int!
    }

    "Paging, search, filter and sort of the powers of attorney; field names are a fixed whitelist."
    input PowerOfAttorneyListInput {
        skip: Int
        take: Int
        "Substring match against the number, the holder and the counterparty name and INN."
        search: String
        filter: PowerOfAttorneyFilter
        sort: PowerOfAttorneySort
    }

    input PowerOfAttorneyFilter {
        number: StringOperators
        holder: StringOperators
        validFrom: DateOperators
        validUntil: DateOperators
        status: StringOperators
        contract: StringOperators
        contractId: IDOperators
        customer: StringOperators
        counterpartyId: IDOperators
        hasScan: BooleanOperators
        contractDeleted: BooleanOperators
        _and: [PowerOfAttorneyFilter!]
    }

    input PowerOfAttorneySort {
        number: SortOrder
        holder: SortOrder
        validFrom: SortOrder
        validUntil: SortOrder
        customer: SortOrder
    }

    extend type Query {
        visiblePowersOfAttorney(list: PowerOfAttorneyListInput): PowerOfAttorneyPage!
    }
`;
