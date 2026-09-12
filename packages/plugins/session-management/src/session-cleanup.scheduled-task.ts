import { Logger, ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { SessionManagementService } from './session-management.service';
import { CLEANUP_POLL_INTERVAL_DEFAULT, loggerCtx } from './session.types';
import type { SessionManagementPluginOptions } from './session.types';

// Issue #80: standard for recurring/periodic plugin work is Vendure's own ScheduledTask
// (DefaultSchedulerPlugin, registered in apps/server/src/vendure-config.ts) — worker-process-only
// and DB-locked out of the box, plus enable/disable + run-now via the admin API, replacing the
// previous raw BullMQ Queue+Worker (session-cleanup.worker.ts).
export function createSessionCleanupTask(options: SessionManagementPluginOptions): ScheduledTask {
    const everyMs = options.cleanupPollIntervalMs ?? CLEANUP_POLL_INTERVAL_DEFAULT;
    return new ScheduledTask({
        id: 'session-cleanup',
        description: 'Deletes expired customer/administrator sessions.',
        schedule: cronEveryMs(everyMs),
        execute: async ({ injector }) => {
            const deleted = await injector.get(SessionManagementService).deleteExpiredSessions();
            if (deleted > 0) {
                Logger.verbose(`Deleted ${deleted} expired session(s)`, loggerCtx);
            }
            return { deleted };
        },
    });
}
