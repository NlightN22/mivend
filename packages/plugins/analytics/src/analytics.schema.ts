import type { DocumentNode } from 'graphql';
import gql from 'graphql-tag';

export const adminApiSchema: DocumentNode = gql`
    type AnalyticsReport {
        key: String!
        title: String!
        description: String!
        area: String!
        status: String!
        note: String!
    }

    extend type Query {
        analyticsReports: [AnalyticsReport!]!
    }
`;
