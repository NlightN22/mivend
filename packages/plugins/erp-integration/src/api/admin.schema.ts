import { gql } from 'graphql-tag';
import type { DocumentNode } from 'graphql';

export const adminApiExtensions: DocumentNode = gql`
    type FailedIntegrationInboxEvent {
        id: ID!
        stream: String!
        entityId: String!
        lastError: String
        attempts: Int!
        updatedAt: DateTime!
    }

    type FailedIntegrationInboxEventList {
        items: [FailedIntegrationInboxEvent!]!
        totalItems: Int!
    }

    input FailedIntegrationInboxEventListOptions {
        take: Int
        skip: Int
    }

    extend type Query {
        "Dead-lettered inbound Kafka events, newest first — for the manager-portal dashboard's integration-health panel (issue #76)."
        failedIntegrationInboxEvents(
            options: FailedIntegrationInboxEventListOptions
        ): FailedIntegrationInboxEventList!
    }
`;
