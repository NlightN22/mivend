import {
    Logger,
    RequestContextService,
    ScheduledTask,
    TransactionalConnection,
} from '@vendure/core';
import { cronEveryMs, ctxQuery } from 'shared';

import {
    CLEANUP_POLL_INTERVAL_DEFAULT,
    KNOWN_DEVICE_RETENTION_DAYS_DEFAULT,
    loggerCtx,
} from './session.types';
import type { SessionManagementPluginOptions } from './session.types';

// known_device has no foreign key (soft link by user id), so rows of deleted users are swept here too.
export const CLEANUP_KNOWN_DEVICES_SQL = `WITH removed AS (
    DELETE FROM known_device kd
    WHERE kd."lastSeenAt" < now() - make_interval(days => $1)
       OR NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id::text = kd."userId")
    RETURNING 1
) SELECT count(*) AS deleted FROM removed`;

export function createKnownDeviceCleanupTask(
    options: SessionManagementPluginOptions,
): ScheduledTask {
    const days = options.knownDeviceRetentionDays ?? KNOWN_DEVICE_RETENTION_DAYS_DEFAULT;
    return new ScheduledTask({
        id: 'known-device-cleanup',
        description:
            'Deletes known devices not seen within the retention period and those of deleted users.',
        schedule: cronEveryMs(options.cleanupPollIntervalMs ?? CLEANUP_POLL_INTERVAL_DEFAULT),
        execute: async ({ injector }) => {
            const ctx = await injector.get(RequestContextService).create({ apiType: 'admin' });
            const [{ deleted }] = await ctxQuery<Array<{ deleted: string }>>(
                injector.get(TransactionalConnection),
                ctx,
                CLEANUP_KNOWN_DEVICES_SQL,
                [days],
            );
            if (Number(deleted) > 0) {
                Logger.verbose(`Deleted ${deleted} stale known device(s)`, loggerCtx);
            }
            return { deleted: Number(deleted) };
        },
    });
}
