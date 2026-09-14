// Backend-agnostic notification shapes (issue #87 part 4) — mirror the GraphQL `Notification`
// type shared by admin.schema.ts and shop.schema.ts. Kept transport-agnostic on purpose: neither
// portal's GraphQL client/codegen types are imported here, so ui-kit stays free of a WS/Apollo
// dependency. A portal's own transport implementation adapts its generated types to this shape.

export type NotificationKind = 'info' | 'success' | 'warning' | 'error';

export type NotificationStatus = 'unread' | 'read' | 'resolved';

export interface NotificationItem {
    id: string;
    kind: NotificationKind;
    sourceType: string;
    sourceId: string | null;
    title: string;
    message: string;
    status: NotificationStatus;
    readAt: string | null;
    resolvedAt: string | null;
    resolution: string | null;
    createdAt: string;
}

// issue #92: fetch() now takes real pagination/search options and returns totalItems alongside
// the page, instead of always returning "the first 50, whatever that is" with no way to know
// there's more or to get an accurate unread count once a recipient has more than one page.
export interface NotificationFetchOptions {
    status?: NotificationStatus;
    search?: string;
    take?: number;
    skip?: number;
}

export interface NotificationPage {
    items: NotificationItem[];
    totalItems: number;
}

export interface NotificationTransport {
    fetch(opts?: NotificationFetchOptions): Promise<NotificationPage>;
    subscribe(onReceived: (n: NotificationItem) => void): () => void;
    markRead(id: string): Promise<NotificationItem>;
    resolve(id: string, resolution: string): Promise<NotificationItem>;
}
