import { graphql } from '@vendure/dashboard';

export const legalNameAbbreviationListDocument = graphql(`
    query LegalNameAbbreviationsForDashboard($options: LegalNameAbbreviationListOptions) {
        legalNameAbbreviations(options: $options) {
            items {
                id
                createdAt
                updatedAt
                uuid
                phrase
                abbreviation
            }
            totalItems
        }
    }
`);

export const createLegalNameAbbreviationDocument = graphql(`
    mutation CreateLegalNameAbbreviationFromDashboard($input: LegalNameAbbreviationInput!) {
        createLegalNameAbbreviation(input: $input) {
            id
        }
    }
`);

export const updateLegalNameAbbreviationDocument = graphql(`
    mutation UpdateLegalNameAbbreviationFromDashboard(
        $id: ID!
        $input: LegalNameAbbreviationInput!
    ) {
        updateLegalNameAbbreviation(id: $id, input: $input) {
            id
        }
    }
`);

export const deleteLegalNameAbbreviationDocument = graphql(`
    mutation DeleteLegalNameAbbreviationFromDashboard($id: ID!) {
        deleteLegalNameAbbreviation(id: $id)
    }
`);
