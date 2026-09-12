import { Logger, ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { IntegrationInboxProcessorService } from './integration-inbox-processor.service';
import { INBOX_POLL_INTERVAL_DEFAULT, loggerCtx } from './types';
import type { ErpIntegrationPluginOptions } from './types';

// Central-hub-only, mirroring the outbox task. Issue #80: standard for recurring/periodic
// plugin work is Vendure's own ScheduledTask (DefaultSchedulerPlugin, registered in
// apps/server/src/vendure-config.ts) — worker-process-only and DB-locked out of the box, plus
// enable/disable + run-now via the admin API, replacing the previous raw BullMQ Queue+Worker
// (integration-inbox.worker.ts).
export function createIntegrationInboxTask(options: ErpIntegrationPluginOptions): ScheduledTask {
    const everyMs = options.inboxPollIntervalMs ?? INBOX_POLL_INTERVAL_DEFAULT;
    return new ScheduledTask({
        id: 'erp-integration-inbox',
        description: 'Processes pending Integration Service inbox records (central hub only).',
        schedule: cronEveryMs(everyMs),
        execute: async ({ injector }) => {
            if (options.instanceType !== 'central') return { skipped: true };

            const { processed, failed } = await injector
                .get(IntegrationInboxProcessorService)
                .processPendingBatch();
            if (processed > 0 || failed > 0) {
                Logger.verbose(
                    `Integration inbox sweep: ${processed} processed, ${failed} failed/retrying`,
                    loggerCtx,
                );
            }
            return { processed, failed };
        },
    });
}
