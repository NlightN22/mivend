import { createClient } from 'graphql-ws';
import type { Client } from 'graphql-ws';
import { getCapturedAuthToken } from './client';

// Same-origin WS endpoint proxied by vite.config.ts in dev (and by the production reverse
// proxy) to apps/server's mountNotificationSubscriptions('/shop-api-subscriptions', 'shop').
const SUBSCRIPTIONS_PATH = '/shop-api-subscriptions';

function wsUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}${SUBSCRIPTIONS_PATH}`;
}

// Lazily created — a captured auth token (see client.ts) is only available once the storefront
// has made at least one authenticated request, which always happens before any page that shows
// the notification bell mounts.
let wsClient: Client | null = null;

export function getNotificationsWsClient(): Client {
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
