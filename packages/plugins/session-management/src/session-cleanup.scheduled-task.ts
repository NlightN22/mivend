import { Logger, ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { SessionManagementService } from './session-management.service';
import { CLEANUP_POLL_INTERVAL_DEFAULT, loggerCtx } from './session.types';
import type { SessionManagementPluginOptions } from './session.types';

// Use Vendure's ScheduledTask, not BullMQ: it runs in the worker only and is DB-locked by default.
// Requires DefaultSchedulerPlugin in vendure-config.ts; admin API gives enable/disable and run-now.
export function createSessionCleanupTask(options: SessionManagementPluginOptions): ScheduledTask {
    const everyMs = options.cleanupPollIntervalMs ?? CLEANUP_POLL_INTERVAL_DEFAULT;
    return new ScheduledTask({
        id: 'session-cleanup',
        description: 'Deletes expired and ended customer/administrator sessions.',
        schedule: cronEveryMs(everyMs),
        execute: async ({ injector }) => {
            const deleted = await injector.get(SessionManagementService).deleteEndedSessions();
            if (deleted > 0) {
                Logger.verbose(`Deleted ${deleted} ended session(s)`, loggerCtx);
            }
            return { deleted };
        },
    });
}
