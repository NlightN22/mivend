import gql from 'graphql-tag';
import { DocumentNode } from 'graphql';

export const signInProtectionSchema: DocumentNode = gql`
    type SignInCaptchaRequirement {
        required: Boolean!
        siteKey: String
        scriptUrl: String
        widgetGlobal: String
    }

    extend type Query {
        signInCaptchaRequirement(login: String!): SignInCaptchaRequirement!
    }
`;
