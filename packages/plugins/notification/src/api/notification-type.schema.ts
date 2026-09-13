// Single source of truth for the `Notification` GraphQL type and its `NotificationKind`/
// `NotificationStatus` enums (issue #87 audit, mivend.audit.85) — previously hand-duplicated
// across admin.schema.ts, shop.schema.ts, and apps/server/src/subscriptions.ts's own standalone
// executable schema. All three interpolate this string into their own schema; each file's own
// extra bits (extend type Query/Mutation, or the standalone Subscription/Query wrapper) stay
// where they are — only this shared shape is deduplicated.
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
