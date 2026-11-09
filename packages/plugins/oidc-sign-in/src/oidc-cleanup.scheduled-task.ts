import { Logger, RequestContextService, ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { OidcRequestStoreService } from './oidc-request-store.service';
import { OidcSessionTokenStoreService } from './oidc-session-token-store.service';
import { CLEANUP_POLL_INTERVAL_DEFAULT, loggerCtx } from './oidc.types';
import type { OidcPluginOptions } from './oidc.types';

export function createOidcCleanupTask(options: OidcPluginOptions): ScheduledTask {
    return new ScheduledTask({
        id: 'oidc-request-cleanup',
        description: 'Deletes expired external sign-in requests.',
        schedule: cronEveryMs(options.cleanupPollIntervalMs ?? CLEANUP_POLL_INTERVAL_DEFAULT),
        execute: async ({ injector }) => {
            const ctx = await injector.get(RequestContextService).create({ apiType: 'admin' });
            const requests = await injector.get(OidcRequestStoreService).deleteExpired(ctx);
            const tokens = await injector.get(OidcSessionTokenStoreService).deleteOrphans(ctx);
            if (requests > 0) Logger.verbose(`Deleted ${requests} expired request(s)`, loggerCtx);
            return { requests, tokens };
        },
    });
}
