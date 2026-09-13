import { gql } from 'graphql-tag';
import type { DocumentNode } from 'graphql';

export const shopApiExtensions: DocumentNode = gql`
    enum NotificationKind {
        info
        success
        warning
        error
    }

    enum NotificationStatus {
        unread
        read
        resolved
    }

    type Notification {
        id: ID!
        kind: NotificationKind!
        sourceType: String!
        sourceId: String
        title: String!
        message: String!
        status: NotificationStatus!
        readAt: DateTime
        resolvedAt: DateTime
        resolution: String
        createdAt: DateTime!
    }

    extend type Query {
        "The calling customer's own notifications, newest first (issue #87)."
        notifications(status: NotificationStatus): [Notification!]!
    }

    extend type Mutation {
        markNotificationRead(id: ID!): Notification!
        resolveNotification(id: ID!, resolution: String!): Notification!
    }

    # Vendure's base schema defines no Subscription root type, so this declares it rather than
    # extending it (an "extend type Subscription" would fail schema build with no base to extend).
    type Subscription {
        "Fires for the connected customer's own notifications only."
        notificationReceived: Notification!
    }
`;
