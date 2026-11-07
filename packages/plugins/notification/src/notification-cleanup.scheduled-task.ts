import { Logger, RequestContextService, ScheduledTask } from '@vendure/core';

import { NotificationRetentionService } from './notification-retention.service';

export function createNotificationCleanupTask(): ScheduledTask {
    return new ScheduledTask({
        id: 'notification-cleanup',
        description:
            'Deletes read and resolved notifications, and long-unread ones, past their retention.',
        schedule: '0 0 3 * * *',
        execute: async ({ injector }) => {
            const ctx = await injector.get(RequestContextService).create({ apiType: 'admin' });
            const deleted = await injector.get(NotificationRetentionService).deleteExpired(ctx);
            if (deleted > 0)
                Logger.verbose(`Deleted ${deleted} expired notification(s)`, 'NotificationPlugin');
            return { deleted };
        },
    });
}
