import type { NotificationItem, NotificationKind } from './notificationTypes';

export const CLIENT_SOURCE_TYPE = 'client';
// Mirrors the backend caps; a longer text is clipped here so a long message never fails the save.
export const MAX_TITLE_LENGTH = 120;
export const MAX_MESSAGE_LENGTH = 1000;

export interface NotifyOptions {
    title?: string;
    // Trivial UI feedback ("copied", "added to favorites") shows a popup only, it is not kept in the bell.
    ephemeral?: boolean;
    ttlMs?: number;
}

export function clipText(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function defaultTtlMs(kind: NotificationKind): number {
    return kind === 'error' || kind === 'warning' ? 8000 : 4000;
}

// Persisting is the default; ephemeral is the explicit opt-out. Without a signed-in store there is nothing to persist to.
export function shouldPersist(options: NotifyOptions, hasPersister: boolean): boolean {
    return hasPersister && options.ephemeral !== true;
}

// The tab that created a client notification already showed its popup.
export function isClientOrigin(item: Pick<NotificationItem, 'sourceType'>): boolean {
    return item.sourceType === CLIENT_SOURCE_TYPE;
}

export interface Box {
    left: number;
    top: number;
    width: number;
    height: number;
}

export function flightVector(from: Box, to: Box): { x: number; y: number } {
    return {
        x: to.left + to.width / 2 - (from.left + from.width / 2),
        y: to.top + to.height / 2 - (from.top + from.height / 2),
    };
}
