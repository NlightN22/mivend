import { showPopup } from './notificationPopups';
import {
    MAX_MESSAGE_LENGTH,
    MAX_TITLE_LENGTH,
    clipText,
    defaultTtlMs,
    shouldPersist,
    type NotifyOptions,
} from './notifyRules';
import type { NewNotification, NotificationKind } from './notificationTypes';

type Persister = (input: NewNotification) => Promise<void>;

let persister: Persister | null = null;

// useNotifications registers its store here once a user is signed in.
export function setNotificationPersister(next: Persister | null): void {
    persister = next;
}

export function clearNotificationPersister(current: Persister): void {
    if (persister === current) persister = null;
}

// The single place to emit a user-facing message: shows the popup and, unless ephemeral, keeps it in the bell.
export function notify(
    message: string,
    kind: NotificationKind = 'info',
    options: NotifyOptions = {},
): void {
    const title = options.title ?? '';
    const persist = shouldPersist(options, persister !== null);
    showPopup({ title, message, kind, persisted: persist }, options.ttlMs ?? defaultTtlMs(kind));
    if (!persist || !persister) return;
    persister({
        kind,
        title: clipText(title, MAX_TITLE_LENGTH),
        message: clipText(message, MAX_MESSAGE_LENGTH),
    }).catch(err => console.error('Could not store the notification', err));
}
