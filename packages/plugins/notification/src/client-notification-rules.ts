import { UserInputError } from '@vendure/core';

import type { NotificationKind } from './entities/notification.entity';

export const CLIENT_SOURCE_TYPE = 'client';
export const MAX_TITLE_LENGTH = 120;
export const MAX_MESSAGE_LENGTH = 1000;
export const DEDUPE_WINDOW_SECONDS = 60;
export const RATE_WINDOW_SECONDS = 60;
export const RATE_LIMIT_PER_WINDOW = 20;

export interface ClientNotificationInput {
    kind: NotificationKind;
    title?: string | null;
    message: string;
}

export interface NormalizedClientNotification {
    kind: NotificationKind;
    title: string;
    message: string;
}

export function normalizeClientNotification(
    input: ClientNotificationInput,
): NormalizedClientNotification {
    const title = (input.title ?? '').trim();
    const message = input.message.trim();
    if (!message) throw new UserInputError('Notification message must not be empty');
    if (title.length > MAX_TITLE_LENGTH)
        throw new UserInputError(
            `Notification title is longer than ${MAX_TITLE_LENGTH} characters`,
        );
    if (message.length > MAX_MESSAGE_LENGTH)
        throw new UserInputError(
            `Notification message is longer than ${MAX_MESSAGE_LENGTH} characters`,
        );
    return { kind: input.kind, title, message };
}
