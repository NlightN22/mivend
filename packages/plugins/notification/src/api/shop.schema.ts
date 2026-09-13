import { gql } from 'graphql-tag';
import type { DocumentNode } from 'graphql';

import { notificationTypeSDL } from './notification-type.schema';

export const shopApiExtensions: DocumentNode = gql`
    ${notificationTypeSDL}

    type NotificationList {
        items: [Notification!]!
        totalItems: Int!
    }

    input NotificationListOptions {
        status: NotificationStatus
        take: Int
        skip: Int
    }

    extend type Query {
        "The calling customer's own notifications, newest first, server-paginated (issue #87)."
        notifications(options: NotificationListOptions): NotificationList!
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
