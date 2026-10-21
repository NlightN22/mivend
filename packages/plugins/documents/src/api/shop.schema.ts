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
        "ERP-hosted file of an ERP-pushed document (return/reconciliation)."
        fileUrl: String
        "Authorized download path of a generated PDF (proforma invoice/contract); null until ready."
        pdfUrl: String
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
