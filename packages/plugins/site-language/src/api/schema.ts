import { gql } from 'graphql-tag';

export const siteLanguageSchema = gql`
    extend type Query {
        siteDefaultLanguage: String
    }
`;
