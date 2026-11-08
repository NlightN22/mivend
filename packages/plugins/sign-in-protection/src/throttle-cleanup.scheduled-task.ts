import { Logger, RequestContextService, ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { ThrottleStoreService } from './throttle-store.service';
import { loggerCtx } from './types';
import type { SignInProtectionOptions } from './types';

export function createThrottleCleanupTask(options: SignInProtectionOptions): ScheduledTask {
    return new ScheduledTask({
        id: 'sign-in-throttle-cleanup',
        description: 'Deletes sign-in failure counters that have expired.',
        schedule: cronEveryMs(options.throttle.cleanupPollIntervalMs),
        execute: async ({ injector }) => {
            const ctx = await injector.get(RequestContextService).create({ apiType: 'admin' });
            const deleted = await injector
                .get(ThrottleStoreService)
                .deleteStale(ctx, options.throttle.resetAfterMs);
            if (deleted > 0) Logger.verbose(`Deleted ${deleted} stale counter(s)`, loggerCtx);
            return { deleted };
        },
    });
}
