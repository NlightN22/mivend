import gql from 'graphql-tag';
import { DocumentNode } from 'graphql';

export const sessionManagementSchema: DocumentNode = gql`
    type SessionSummary {
        id: ID!
        userAgent: String
        deviceLabel: String!
        createdAt: DateTime!
        expires: DateTime!
        current: Boolean!
    }

    extend type Query {
        mySessions: [SessionSummary!]!
    }

    extend type Mutation {
        endSession(id: ID!): Boolean!
        endOtherSessions: Boolean!
        endAllSessions: Boolean!
    }
`;
