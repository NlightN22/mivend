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
        type: String
        "Exact-match multi-select, populated from documentTypes — see that query's doc comment."
        types: [String!]
        status: String
        "Substring match against the document's own number (ILIKE)."
        search: String
    }

    type OrganizationRequisites {
        id: ID!
        erpId: String!
        legalName: String!
        isActive: Boolean!
    }

    extend type Query {
        # Visibility inherits counterparty visibility — no dedicated permission, filtered by
        # the same counterpartyId (see docs/ai/manager-portal-concept.md §3.3 "/documents").
        # counterpartyId/orderId narrow server-side (still intersected with the caller's
        # visible-counterparty scope) — a caller must never fetch an unbounded page and filter
        # client-side (see AGENTS.md's pagination rule).
        documents(options: DocumentListOptions, counterpartyId: ID, orderId: ID): DocumentList!
        # Real distinct Document.type values within the caller's visible-counterparty scope
        # (optionally narrowed further to one counterparty) — backs the manager portal's Type
        # column checklist filter with live data instead of a hardcoded dropdown (AGENTS.md
        # "Business data must live in the database": document type is free-text ERP data with no
        # fixed value set).
        documentTypes(counterpartyId: ID): [String!]!
        # id/erpId lookup for our own legal entities — see docs/payments.md "Organizations".
        organizationRequisites: [OrganizationRequisites!]!
    }

    extend type Mutation {
        generateContract(counterpartyId: ID!): Boolean!
        # Logo is set here, never pushed via erp-import — see
        # OrganizationRequisites.logoAssetId for why. Upload the logo as a
        # regular Vendure Asset first (createAssets), then pass its id.
        setOrganizationLogo(erpId: String!, assetId: ID!): Boolean!
    }
`;
