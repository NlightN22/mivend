import { describe, expect, it } from 'vitest';

import { retentionFromEnv } from '../../notification-retention.service';

describe('retentionFromEnv', () => {
    it('defaults to 90 days for handled and 365 for unread notifications', () => {
        expect(retentionFromEnv({})).toEqual({ handledDays: 90, unreadDays: 365 });
    });

    it('takes both periods from the environment', () => {
        expect(
            retentionFromEnv({
                NOTIFICATION_RETENTION_READ_DAYS: '30',
                NOTIFICATION_RETENTION_UNREAD_DAYS: '180',
            }),
        ).toEqual({ handledDays: 30, unreadDays: 180 });
    });

    it('falls back to the defaults for a value that is not a positive number', () => {
        expect(
            retentionFromEnv({
                NOTIFICATION_RETENTION_READ_DAYS: 'abc',
                NOTIFICATION_RETENTION_UNREAD_DAYS: '-5',
            }),
        ).toEqual({ handledDays: 90, unreadDays: 365 });
    });
});
