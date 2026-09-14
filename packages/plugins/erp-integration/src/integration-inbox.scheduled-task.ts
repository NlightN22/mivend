import { Logger, ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { IntegrationInboxProcessorService } from './integration-inbox-processor.service';
import {
    INBOX_BULK_BATCH_SIZE_DEFAULT,
    INBOX_BULK_STREAMS,
    INBOX_BULK_TASK_TIMEOUT_MS,
    INBOX_BULK_WALL_CLOCK_BUDGET_MS,
    INBOX_CRITICAL_BATCH_SIZE_DEFAULT,
    INBOX_CRITICAL_STREAMS,
    INBOX_POLL_INTERVAL_DEFAULT,
    loggerCtx,
} from './types';
import type { ErpIntegrationPluginOptions } from './types';

// Central-hub-only, mirroring the outbox task. Issue #80: standard for recurring/periodic
// plugin work is Vendure's own ScheduledTask (DefaultSchedulerPlugin, registered in
// apps/server/src/vendure-config.ts) — worker-process-only and DB-locked out of the box, plus
// enable/disable + run-now via the admin API, replacing the previous raw BullMQ Queue+Worker
// (integration-inbox.worker.ts).
//
// Issue #93: split into two independent lanes so a large bulk backlog (a full price/stock resync,
// hundreds of thousands of rows) can never starve order-registration-result, which reservation
// release depends on (OrderRegistrationResultHandler). Both lanes claim from the same
// IntegrationInboxEvent table but with disjoint `stream` filters (INBOX_CRITICAL_STREAMS/
// INBOX_BULK_STREAMS), so a row is claimed by exactly one lane.
export function createIntegrationInboxCriticalTask(
    options: ErpIntegrationPluginOptions,
): ScheduledTask {
    const everyMs = options.inboxPollIntervalMs ?? INBOX_POLL_INTERVAL_DEFAULT;
    return new ScheduledTask({
        id: 'erp-integration-inbox-critical',
        description:
            'Processes pending order-registration-result inbox records promptly, independent of the bulk catalog/price/stock lane (central hub only).',
        schedule: cronEveryMs(everyMs),
        execute: async ({ injector }) => {
            if (options.instanceType !== 'central') return { skipped: true };

            const { processed, failed } = await injector
                .get(IntegrationInboxProcessorService)
                .processPendingBatch(
                    undefined,
                    [...INBOX_CRITICAL_STREAMS],
                    INBOX_CRITICAL_BATCH_SIZE_DEFAULT,
                );
            if (processed > 0 || failed > 0) {
                Logger.verbose(
                    `Integration inbox critical-lane sweep: ${processed} processed, ${failed} failed/retrying`,
                    loggerCtx,
                );
            }
            return { processed, failed };
        },
    });
}

export function createIntegrationInboxBulkTask(
    options: ErpIntegrationPluginOptions,
): ScheduledTask {
    const everyMs = options.inboxPollIntervalMs ?? INBOX_POLL_INTERVAL_DEFAULT;
    return new ScheduledTask({
        id: 'erp-integration-inbox-bulk',
        description:
            'Processes pending catalog/price/stock/etc. inbox records in adaptive-size batches (central hub only).',
        schedule: cronEveryMs(everyMs),
        // DefaultSchedulerStrategy.runTask races task.execute() against this timeout and marks
        // the task 'failed' + releases its lock if it's exceeded — but a JS Promise can't
        // actually be cancelled, so the reclaim loop below would keep running "orphaned" in the
        // background, invisible to the scheduler, while the next tick's now-unlocked run starts a
        // second one alongside it (mivend.audit.90's review of issue #93, MEDIUM-HIGH finding).
        // INBOX_BULK_WALL_CLOCK_BUDGET_MS below keeps the loop itself well under this timeout
        // regardless of backlog size — this override just documents the intent and adds margin
        // rather than relying on the 60s default alone.
        timeout: INBOX_BULK_TASK_TIMEOUT_MS,
        execute: async ({ injector }) => {
            if (options.instanceType !== 'central') return { skipped: true };

            const processor = injector.get(IntegrationInboxProcessorService);
            let totalProcessed = 0;
            let totalFailed = 0;
            const startedAt = Date.now();
            // Immediate reclaim while a batch comes back full (queue likely still has more
            // pending) instead of waiting out the fixed poll interval — only falls back to the
            // normal interval once a batch comes back partial/empty or the wall-clock budget is
            // spent. Bounding by wall-clock (not just "batch not full") guarantees this execution
            // finishes within its own scheduler timeout no matter how large the backlog is —
            // an unbounded backlog just means more ticks, not a stuck/orphaned task.
            for (;;) {
                const { processed, failed, claimed } = await processor.processPendingBatch(
                    undefined,
                    [...INBOX_BULK_STREAMS],
                    INBOX_BULK_BATCH_SIZE_DEFAULT,
                );
                totalProcessed += processed;
                totalFailed += failed;
                if (claimed < INBOX_BULK_BATCH_SIZE_DEFAULT) break;
                if (Date.now() - startedAt >= INBOX_BULK_WALL_CLOCK_BUDGET_MS) break;
            }
            if (totalProcessed > 0 || totalFailed > 0) {
                Logger.verbose(
                    `Integration inbox bulk-lane sweep: ${totalProcessed} processed, ${totalFailed} failed/retrying`,
                    loggerCtx,
                );
            }
            return { processed: totalProcessed, failed: totalFailed };
        },
    });
}
