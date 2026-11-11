import { cronEveryMs } from 'shared';
import { Logger, RequestContextService, ScheduledTask } from '@vendure/core';

import { NotificationRetentionService } from './notification-retention.service';

export function createNotificationCleanupTask(): ScheduledTask {
    return new ScheduledTask({
        id: 'notification-cleanup',
        description:
            'Deletes read, resolved and long-unread notifications past the retention set per source type in the notification settings.',
        schedule: cronEveryMs(60 * 60 * 1000),
        execute: async ({ injector }) => {
            const ctx = await injector.get(RequestContextService).create({ apiType: 'admin' });
            const deleted = await injector.get(NotificationRetentionService).deleteExpired(ctx);
            if (deleted > 0)
                Logger.verbose(`Deleted ${deleted} expired notification(s)`, 'NotificationPlugin');
            return { deleted };
        },
    });
}
