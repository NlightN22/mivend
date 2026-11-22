import type {
    NotificationFetchOptions,
    NewNotification,
    NotificationItem,
    NotificationPage,
    NotificationTransport,
} from '@mivend/ui-kit';
import { i18n } from '../i18n';
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
const EMAIL_CONFIRMATION_SOURCE = 'email-confirmation';

function toNotificationItem(fragment: NotificationFieldsFragment): NotificationItem {
    const localized = fragment.sourceType === EMAIL_CONFIRMATION_SOURCE;
    return {
        id: fragment.id,
        kind: fragment.kind as unknown as NotificationItem['kind'],
        sourceType: fragment.sourceType,
        sourceId: fragment.sourceId ?? null,
        title: localized ? i18n.global.t('notifications.emailConfirmation.title') : fragment.title,
        message: localized
            ? i18n.global.t('notifications.emailConfirmation.message')
            : fragment.message,
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

async function createNotification(input: NewNotification): Promise<NotificationItem | null> {
    const result = await shopApi(CreateClientNotificationDocument, {
        input: { ...input, kind: input.kind as unknown as GeneratedNotificationKind },
    });
    return result.createClientNotification
        ? toNotificationItem(result.createClientNotification)
        : null;
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
