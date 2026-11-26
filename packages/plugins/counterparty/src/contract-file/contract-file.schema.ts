import gql from 'graphql-tag';

export const contractFileAdminSchema = gql`
    "A scan or other file attached to an ERP contract; never sent to the ERP (#405)."
    type ContractFile {
        id: ID!
        uuid: String!
        contractId: ID!
        "scan | power-of-attorney-scan | other"
        kind: String!
        fileName: String!
        uploadedBy: String
        createdAt: DateTime!
        downloadUrl: String!
    }

    "A customer contract of a counterparty with its files; hasScan is the control flag for an active contract."
    type CounterpartyContract {
        id: ID!
        erpId: String!
        name: String
        isActive: Boolean!
        currency: String
        hasScan: Boolean!
        files: [ContractFile!]!
    }

    type CounterpartyContractPage {
        items: [CounterpartyContract!]!
        totalItems: Int!
    }

    extend type Query {
        "search matches the contract name or ERP id; withoutScan keeps active contracts lacking a scan."
        counterpartyContracts(
            counterpartyId: ID!
            search: String
            withoutScan: Boolean
            skip: Int
            take: Int
        ): CounterpartyContractPage!
    }

    extend type Mutation {
        "A new scan replaces the contract's previous scan."
        uploadContractFile(contractId: ID!, kind: String!, file: Upload!): ContractFile!
        deleteContractFile(uuid: String!): Boolean!
    }
`;

export const contractFileShopSchema = gql`
    type ShopContractFile {
        uuid: String!
        contractId: ID!
        contractName: String
        kind: String!
        fileName: String!
        createdAt: DateTime!
        downloadUrl: String!
    }

    type ShopContractFilePage {
        items: [ShopContractFile!]!
        totalItems: Int!
    }

    extend type Query {
        myContractFiles(skip: Int, take: Int): ShopContractFilePage!
    }
`;
