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
        # ERP-pushed documents (return/reconciliation) carry a direct fileUrl (ERP
        # already hosts the file). Self-generated documents (proforma invoice/contract) expose
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
        type: String
        search: String
    }

    "Seller requisites of the organization that issued a proforma invoice."
    type ProformaInvoiceSeller {
        legalName: String!
        inn: String
        kpp: String
        legalAddress: String
        bankName: String
        bankAccount: String
        bankBik: String
        correspondentAccount: String
    }

    extend type ProformaInvoice {
        seller: ProformaInvoiceSeller
        "The printable document of this snapshot; null until the document row exists."
        document: Document
    }

    extend type Query {
        myDocuments(options: DocumentListOptions): DocumentList!
    }
`;
