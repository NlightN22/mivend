// Transport-agnostic on purpose: no portal GraphQL/codegen imports, so ui-kit has no WS/Apollo dep.
// Each portal's transport adapts its generated types to this shape.

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

// Returns totalItems with the page: one page can't show more results or the true unread count.
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
