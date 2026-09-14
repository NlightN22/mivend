import { createClient } from 'graphql-ws';
import type { Client } from 'graphql-ws';
import type {
    NotificationFetchOptions,
    NotificationItem,
    NotificationPage,
    NotificationStatus,
    NotificationTransport,
} from '@mivend/ui-kit';
import type { SelectOption, StatusBadgeVariant } from '@mivend/ui-kit';
import { adminApi, getCapturedAuthToken } from './client';
import {
    MarkNotificationReadDocument,
    NotificationReceivedDocument,
    NotificationsDocument,
    ResolveNotificationDocument,
} from './generated/graphql';

// Same-origin WS endpoint proxied by vite.config.ts in dev (and by the production reverse
// proxy) to apps/server's mountNotificationSubscriptions('/admin-api-subscriptions', 'admin').
const SUBSCRIPTIONS_PATH = '/admin-api-subscriptions';

function wsUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}${SUBSCRIPTIONS_PATH}`;
}

// Lazily created — a fresh admin bearer token (captured from the HTTP transport's own
// vendure-auth-token response header, see client.ts) is only available once the manager portal
// has made at least one authenticated request, which always happens before any page that shows
// the notification bell mounts.
let wsClient: Client | null = null;

function getWsClient(): Client {
    if (!wsClient) {
        wsClient = createClient({
            url: wsUrl(),
            connectionParams: () => {
                const token = getCapturedAuthToken();
                return token ? { authorization: `Bearer ${token}` } : {};
            },
        });
    }
    return wsClient;
}

// issue #92: the full /notifications page's status filter + view chips — single source of truth
// reused by both, per the manager-table-standard skill (point 4/4a).
export const NOTIFICATION_STATUS_OPTIONS: SelectOption[] = [
    { value: '', label: 'All statuses' },
    { value: 'unread', label: 'Unread' },
    { value: 'read', label: 'Read' },
    { value: 'resolved', label: 'Resolved' },
];
export const NOTIFICATION_STATUS_BADGE_VARIANT: Record<NotificationStatus, StatusBadgeVariant> = {
    unread: 'warning',
    read: 'neutral',
    resolved: 'success',
};

export async function fetchNotifications(
    opts: NotificationFetchOptions = {},
): Promise<NotificationPage> {
    const result = await adminApi(NotificationsDocument, { options: opts });
    return result.notifications as NotificationPage;
}

export interface NotificationViewCounts {
    all: number;
    unread: number;
    read: number;
    resolved: number;
}

// One lean COUNT per chip (take: 0 — see manager-table-standard point 4a) rather than deriving
// counts from whatever page happens to be loaded.
export async function fetchNotificationViewCounts(): Promise<NotificationViewCounts> {
    const [all, unread, read, resolved] = await Promise.all([
        fetchNotifications({ take: 0 }),
        fetchNotifications({ take: 0, status: 'unread' }),
        fetchNotifications({ take: 0, status: 'read' }),
        fetchNotifications({ take: 0, status: 'resolved' }),
    ]);
    return {
        all: all.totalItems,
        unread: unread.totalItems,
        read: read.totalItems,
        resolved: resolved.totalItems,
    };
}

function subscribeToNotifications(onReceived: (item: NotificationItem) => void): () => void {
    return getWsClient().subscribe<{ notificationReceived: NotificationItem }>(
        { query: NotificationReceivedDocument.toString() },
        {
            next: result => {
                if (result.data) {
                    onReceived(result.data.notificationReceived);
                }
            },
            error: err => {
                console.error('Notification subscription error', err);
            },
            complete: () => undefined,
        },
    );
}

export async function markNotificationRead(id: string): Promise<NotificationItem> {
    const result = await adminApi(MarkNotificationReadDocument, { id });
    return result.markNotificationRead as NotificationItem;
}

export async function resolveNotification(
    id: string,
    resolution: string,
): Promise<NotificationItem> {
    const result = await adminApi(ResolveNotificationDocument, { id, resolution });
    return result.resolveNotification as NotificationItem;
}

export const notificationTransport: NotificationTransport = {
    fetch: fetchNotifications,
    subscribe: subscribeToNotifications,
    markRead: markNotificationRead,
    resolve: resolveNotification,
};
