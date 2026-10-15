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
