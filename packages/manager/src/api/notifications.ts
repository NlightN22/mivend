import { createClient } from 'graphql-ws';
import type { Client } from 'graphql-ws';
import type { NotificationItem, NotificationStatus, NotificationTransport } from '@mivend/ui-kit';
import { adminApi, getCapturedAuthToken } from './client';

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

const NOTIFICATION_FIELDS = `
    id
    kind
    sourceType
    sourceId
    title
    message
    status
    readAt
    resolvedAt
    resolution
    createdAt
`;

export async function fetchNotifications(status?: NotificationStatus): Promise<NotificationItem[]> {
    const result = await adminApi<{ notifications: NotificationItem[] }>(
        `query Notifications($status: NotificationStatus) {
            notifications(status: $status) {
                ${NOTIFICATION_FIELDS}
            }
        }`,
        { status },
    );
    return result.notifications;
}

function subscribeToNotifications(onReceived: (item: NotificationItem) => void): () => void {
    return getWsClient().subscribe<{ notificationReceived: NotificationItem }>(
        {
            query: `subscription NotificationReceived {
                notificationReceived {
                    ${NOTIFICATION_FIELDS}
                }
            }`,
        },
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
    const result = await adminApi<{ markNotificationRead: NotificationItem }>(
        `mutation MarkNotificationRead($id: ID!) {
            markNotificationRead(id: $id) {
                ${NOTIFICATION_FIELDS}
            }
        }`,
        { id },
    );
    return result.markNotificationRead;
}

async function resolveNotification(id: string, resolution: string): Promise<NotificationItem> {
    const result = await adminApi<{ resolveNotification: NotificationItem }>(
        `mutation ResolveNotification($id: ID!, $resolution: String!) {
            resolveNotification(id: $id, resolution: $resolution) {
                ${NOTIFICATION_FIELDS}
            }
        }`,
        { id, resolution },
    );
    return result.resolveNotification;
}

export const notificationTransport: NotificationTransport = {
    fetch: fetchNotifications,
    subscribe: subscribeToNotifications,
    markRead: markNotificationRead,
    resolve: resolveNotification,
};
