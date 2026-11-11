// Interpolated into three schemas (admin, shop, subscriptions), so it holds only the shared types.
// Root Query/Mutation/Subscription extensions must stay in each file, not here.
export const notificationTypeSDL = `
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

    "A notification a portal shows as a popup and keeps in the bell (#348). The owner is always the caller."
    input ClientNotificationInput {
        kind: NotificationKind!
        "Up to 120 characters, may be empty."
        title: String
        "Up to 1000 characters."
        message: String!
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
`;
