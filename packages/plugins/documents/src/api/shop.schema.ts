import { gql } from 'graphql-tag';

export const shopApiExtensions = gql`
    type Document {
        id: ID!
        type: String!
        number: String!
        issueDate: DateTime!
        amount: Int
        currencyCode: String
        status: String!
        orderId: ID
        # ERP-pushed documents (return/reconciliation) carry a direct fileUrl (1C
        # already hosts the file). Self-generated documents (invoice/contract) expose
        # \`asset\` instead — Vendure's own Asset.source resolver (registered by
        # AssetServerPlugin) builds the correct absolute URL from the live request,
        # so the storefront should NOT construct download URLs itself in either case.
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
        myDocuments(options: DocumentListOptions): DocumentList!
    }
`;
