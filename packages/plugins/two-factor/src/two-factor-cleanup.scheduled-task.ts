import { Logger, RequestContextService, ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { TokenStoreService } from './token-store.service';
import { CLEANUP_POLL_INTERVAL_DEFAULT, loggerCtx } from './two-factor.types';
import type { TwoFactorPluginOptions } from './two-factor.types';

export function createTwoFactorCleanupTask(options: TwoFactorPluginOptions): ScheduledTask {
    return new ScheduledTask({
        id: 'two-factor-cleanup',
        description: 'Deletes expired sign-in challenges and recovery links.',
        schedule: cronEveryMs(options.cleanupPollIntervalMs ?? CLEANUP_POLL_INTERVAL_DEFAULT),
        execute: async ({ injector }) => {
            const ctx = await injector.get(RequestContextService).create({ apiType: 'admin' });
            const tokens = await injector.get(TokenStoreService).deleteExpired(ctx);
            if (tokens > 0) Logger.verbose(`Deleted ${tokens} expired token(s)`, loggerCtx);
            return { tokens };
        },
    });
}
