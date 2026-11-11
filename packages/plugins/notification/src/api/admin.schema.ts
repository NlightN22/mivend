import { gql } from 'graphql-tag';
import type { DocumentNode } from 'graphql';

import { notificationTypeSDL } from './notification-type.schema';

export const adminApiExtensions: DocumentNode = gql`
    ${notificationTypeSDL}

    type NotificationList {
        items: [Notification!]!
        totalItems: Int!
    }

    input NotificationListOptions {
        status: NotificationStatus
        "Case-insensitive contains match against title or message (issue #92 — the full notifications page's search box)."
        search: String
        take: Int
        skip: Int
    }

    "How long notifications of one source type are kept; null days inherit the default rule ('*')."
    type NotificationRetentionRule implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        uuid: String!
        sourceType: String!
        "Read and resolved notifications."
        readDays: Int
        unreadDays: Int
    }

    type NotificationRetentionRuleList implements PaginatedList {
        items: [NotificationRetentionRule!]!
        totalItems: Int!
    }

    "Whole days, 1 to 3650; null inherits the default rule and is refused on the default rule itself."
    input NotificationRetentionRuleInput {
        readDays: Int
        unreadDays: Int
    }

    extend type Query {
        notificationRetentionRules: NotificationRetentionRuleList!
        "The calling administrator's own notifications plus visible broadcast notifications, newest first, server-paginated (issue #87)."
        notifications(options: NotificationListOptions): NotificationList!
    }

    extend type Mutation {
        updateNotificationRetentionRule(
            id: ID!
            input: NotificationRetentionRuleInput!
        ): NotificationRetentionRule!
        "Stores a popup the caller saw as their own notification; an identical one within a minute is returned, not duplicated (#348)."
        createClientNotification(input: ClientNotificationInput!): Notification!
        markNotificationRead(id: ID!): Notification!
        resolveNotification(id: ID!, resolution: String!): Notification!
    }

    # Vendure's base schema defines no Subscription root type, so this declares it rather than
    # extending it (an "extend type Subscription" would fail schema build with no base to extend).
    type Subscription {
        "Fires for the connected administrator's own notifications, plus every broadcast-to-all-administrators notification this administrator has permission to see."
        notificationReceived: Notification!
    }
`;
