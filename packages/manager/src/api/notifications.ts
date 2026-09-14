import { createClient } from 'graphql-ws';
import type { Client } from 'graphql-ws';
import type { NotificationItem, NotificationStatus, NotificationTransport } from '@mivend/ui-kit';
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

export async function fetchNotifications(status?: NotificationStatus): Promise<NotificationItem[]> {
    const result = await adminApi(NotificationsDocument, {
        options: status ? { status } : undefined,
    });
    return result.notifications.items as NotificationItem[];
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

async function markNotificationRead(id: string): Promise<NotificationItem> {
    const result = await adminApi(MarkNotificationReadDocument, { id });
    return result.markNotificationRead as NotificationItem;
}

async function resolveNotification(id: string, resolution: string): Promise<NotificationItem> {
    const result = await adminApi(ResolveNotificationDocument, { id, resolution });
    return result.resolveNotification as NotificationItem;
}

export const notificationTransport: NotificationTransport = {
    fetch: fetchNotifications,
    subscribe: subscribeToNotifications,
    markRead: markNotificationRead,
    resolve: resolveNotification,
};
