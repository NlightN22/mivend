import { gql } from 'graphql-tag';

export const legalDocumentsSchema = gql`
    type LegalDocument {
        kind: String!
        version: Int!
        versionLabel: String!
        locale: String!
        title: String!
        body: String!
        effectiveDate: DateTime!
    }

    type LegalConsentOffer {
        kind: String!
        version: Int!
        requiredVersion: Int!
        required: Boolean!
    }

    type LegalDocumentStatus {
        kind: String!
        version: Int!
        required: Boolean!
        accepted: Boolean!
        pending: Boolean!
    }

    type LegalAcceptance {
        id: ID!
        kind: String!
        version: Int!
        accepted: Boolean!
        locale: String!
        portal: String!
        createdAt: DateTime!
    }

    type LegalAcceptanceList {
        items: [LegalAcceptance!]!
        totalItems: Int!
    }

    input LegalAcceptanceInput {
        kind: String!
        version: Int!
        accepted: Boolean!
    }

    extend type Query {
        legalDocument(kind: String!, locale: String): LegalDocument
        legalConsentOffer: [LegalConsentOffer!]!
        legalDocumentStatus: [LegalDocumentStatus!]!
        legalAcceptanceHistory(skip: Int, take: Int): LegalAcceptanceList!
    }

    extend type Mutation {
        acceptLegalDocuments(
            input: [LegalAcceptanceInput!]!
            locale: String
        ): [LegalDocumentStatus!]!
        confirmEmailAddress(token: String!): Boolean!
    }
`;
