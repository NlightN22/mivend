import type { DocumentNode } from 'graphql';
import gql from 'graphql-tag';

export const systemHealthSdl: DocumentNode = gql`
    type SystemHealthCheckItem {
        id: String!
        label: String!
        ok: Boolean!
        detail: String
    }

    extend type Query {
        systemHealthChecklist: [SystemHealthCheckItem!]!
    }
`;
