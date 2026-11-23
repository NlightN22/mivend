import { gql } from 'graphql-tag';

export const legalDocumentsAdminSchema = gql`
    extend type Customer {
        emailConfirmationPending: String
        emailConfirmationSentAt: DateTime
    }

    extend type Mutation {
        resendEmailConfirmation(customerId: ID!): Boolean!
    }
`;
