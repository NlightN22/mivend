import { gql } from 'graphql-tag';

export const adminApiExtensions = gql`
    type Document {
        id: ID!
        type: String!
        number: String!
        issueDate: DateTime!
        amount: Int
        currencyCode: String
        status: String!
        counterpartyId: ID!
        orderId: ID
        fileUrl: String
        asset: Asset
    }

    type DocumentList {
        items: [Document!]!
        totalItems: Int!
    }

    input DocumentListOptions {
        take: Int
        skip: Int
    }

    extend type Query {
        # Visibility inherits counterparty visibility — no dedicated permission, filtered by
        # the same counterpartyId (see docs/ai/manager-portal-concept.md §3.3 "/documents").
        documents(options: DocumentListOptions): DocumentList!
    }

    extend type Mutation {
        generateContract(counterpartyId: ID!): Boolean!
        # Logo is set here, never pushed via erp-import — see
        # OrganizationRequisites.logoAssetId for why. Upload the logo as a
        # regular Vendure Asset first (createAssets), then pass its id.
        setOrganizationLogo(erpId: String!, assetId: ID!): Boolean!
    }
`;
