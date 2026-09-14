import type {
    NotificationFetchOptions,
    NotificationItem,
    NotificationPage,
    NotificationTransport,
} from '@mivend/ui-kit';
import { shopApi } from './client';
import { getNotificationsWsClient } from './notificationsWsClient';
import {
    MarkNotificationReadDocument,
    NotificationReceivedDocument,
    NotificationsDocument,
    ResolveNotificationDocument,
    type NotificationFieldsFragment,
    type NotificationReceivedSubscription,
    NotificationStatus as GeneratedNotificationStatus,
} from './generated/graphql';

// Codegen's generated NotificationStatus/NotificationKind are branded string enums, not plain
// string-literal unions, and its optional (`?:`) nullable fields can come back as `undefined`
// where ui-kit's transport-agnostic NotificationItem (deliberately GraphQL-client-free) requires
// `null` — this mapping normalizes the wire shape into that shape once, at the transport
// boundary, rather than loosening NotificationItem's own types for every consumer.
function toNotificationItem(fragment: NotificationFieldsFragment): NotificationItem {
    return {
        id: fragment.id,
        kind: fragment.kind as unknown as NotificationItem['kind'],
        sourceType: fragment.sourceType,
        sourceId: fragment.sourceId ?? null,
        title: fragment.title,
        message: fragment.message,
        status: fragment.status as unknown as NotificationItem['status'],
        readAt: fragment.readAt ?? null,
        resolvedAt: fragment.resolvedAt ?? null,
        resolution: fragment.resolution ?? null,
        createdAt: fragment.createdAt,
    };
}

export async function fetchNotifications(
    opts: NotificationFetchOptions = {},
): Promise<NotificationPage> {
    const result = await shopApi(NotificationsDocument, {
        options: {
            ...opts,
            status: opts.status ? (opts.status as GeneratedNotificationStatus) : undefined,
        },
    });
    return {
        items: result.notifications.items.map(toNotificationItem),
        totalItems: result.notifications.totalItems,
    };
}

function subscribeToNotifications(onReceived: (item: NotificationItem) => void): () => void {
    return getNotificationsWsClient().subscribe<NotificationReceivedSubscription>(
        { query: NotificationReceivedDocument.toString() },
        {
            next: result => {
                if (result.data) {
                    onReceived(toNotificationItem(result.data.notificationReceived));
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
    const result = await shopApi(MarkNotificationReadDocument, { id });
    return toNotificationItem(result.markNotificationRead);
}

async function resolveNotification(id: string, resolution: string): Promise<NotificationItem> {
    const result = await shopApi(ResolveNotificationDocument, { id, resolution });
    return toNotificationItem(result.resolveNotification);
}

export const notificationTransport: NotificationTransport = {
    fetch: fetchNotifications,
    subscribe: subscribeToNotifications,
    markRead: markNotificationRead,
    resolve: resolveNotification,
};
