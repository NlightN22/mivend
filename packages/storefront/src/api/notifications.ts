import type {
    NotificationFetchOptions,
    NewNotification,
    NotificationItem,
    NotificationPage,
    NotificationTransport,
} from '@mivend/ui-kit';
import { shopApi } from './client';
import { getNotificationsWsClient } from './notificationsWsClient';
import {
    CreateClientNotificationDocument,
    MarkNotificationReadDocument,
    NotificationReceivedDocument,
    NotificationsDocument,
    ResolveNotificationDocument,
    type NotificationFieldsFragment,
    type NotificationReceivedSubscription,
    NotificationKind as GeneratedNotificationKind,
    NotificationStatus as GeneratedNotificationStatus,
} from './generated/graphql';

// Codegen emits branded enums and optional fields that can be undefined; ui-kit's NotificationItem
// is client-free and needs plain literals and null, so normalize here, not loosen its types.
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

async function createNotification(input: NewNotification): Promise<NotificationItem> {
    const result = await shopApi(CreateClientNotificationDocument, {
        input: { ...input, kind: input.kind as unknown as GeneratedNotificationKind },
    });
    return toNotificationItem(result.createClientNotification);
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
    create: createNotification,
    subscribe: subscribeToNotifications,
    markRead: markNotificationRead,
    resolve: resolveNotification,
};
