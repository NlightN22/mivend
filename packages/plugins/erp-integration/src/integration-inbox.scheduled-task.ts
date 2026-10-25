import { Logger, ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { IntegrationInboxProcessorService } from './integration-inbox-processor.service';
import { IntegrationInboxReplayStateService } from './integration-inbox-replay-state.service';
import { IntegrationInboxRetentionService } from './integration-inbox-retention.service';
import {
    INBOX_BULK_BATCH_SIZE_DEFAULT,
    INBOX_BULK_STREAMS,
    INBOX_BULK_TASK_TIMEOUT_MS,
    INBOX_BULK_WALL_CLOCK_BUDGET_MS,
    INBOX_CRITICAL_BATCH_SIZE_DEFAULT,
    INBOX_ORDER_REGISTRATION_RESULT_STREAMS,
    INBOX_POLL_INTERVAL_DEFAULT,
    INBOX_RETENTION_INTERVAL_DEFAULT,
    INBOX_RETENTION_WALL_CLOCK_BUDGET_MS,
    INBOX_USER_BATCH_SIZE_DEFAULT,
    INBOX_USER_STREAMS,
    loggerCtx,
} from './types';
import type { ErpIntegrationPluginOptions } from './types';

// Disjoint stream lanes: a bulk backlog must not starve order-registration-result
// 'user' has its own lane so its claim query never shares a batch or ORDER BY with other streams
export function createIntegrationInboxCriticalTask(
    options: ErpIntegrationPluginOptions,
): ScheduledTask {
    const everyMs = options.inboxPollIntervalMs ?? INBOX_POLL_INTERVAL_DEFAULT;
    return new ScheduledTask({
        id: 'erp-integration-inbox-critical',
        description:
            'Processes pending order-registration-result inbox records promptly, independent of every other lane (central hub only).',
        schedule: cronEveryMs(everyMs),
        execute: async ({ injector }) => {
            if (options.instanceType !== 'central') return { skipped: true };

            const { processed, failed } = await injector
                .get(IntegrationInboxProcessorService)
                .processPendingBatch(
                    [...INBOX_ORDER_REGISTRATION_RESULT_STREAMS],
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

// Kept separate from the order-registration-result lane: merging them would re-create starvation
// No reclaim loop: expected low volume; if needed, add one with a wall-clock budget
export function createIntegrationInboxUserTask(
    options: ErpIntegrationPluginOptions,
): ScheduledTask {
    const everyMs = options.inboxPollIntervalMs ?? INBOX_POLL_INTERVAL_DEFAULT;
    return new ScheduledTask({
        id: 'erp-integration-inbox-user',
        description:
            'Processes pending user inbox records promptly, independent of every other lane (central hub only).',
        schedule: cronEveryMs(everyMs),
        execute: async ({ injector }) => {
            if (options.instanceType !== 'central') return { skipped: true };

            const { processed, failed } = await injector
                .get(IntegrationInboxProcessorService)
                .processPendingBatch([...INBOX_USER_STREAMS], INBOX_USER_BATCH_SIZE_DEFAULT);
            if (processed > 0 || failed > 0) {
                Logger.verbose(
                    `Integration inbox user-lane sweep: ${processed} processed, ${failed} failed/retrying`,
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
    let running = false;
    const everyMs = options.inboxPollIntervalMs ?? INBOX_POLL_INTERVAL_DEFAULT;
    return new ScheduledTask({
        id: 'erp-integration-inbox-bulk',
        description:
            'Processes pending catalog/price/stock/etc. inbox records in adaptive-size batches (central hub only).',
        schedule: cronEveryMs(everyMs),
        // Promise can't be cancelled: a timed-out run would keep looping while the next tick starts another
        // Keep the loop under this timeout via INBOX_BULK_WALL_CLOCK_BUDGET_MS, not by raising it
        timeout: INBOX_BULK_TASK_TIMEOUT_MS,
        execute: async ({ injector }) => {
            if (options.instanceType !== 'central') return { skipped: true };

            if (running) return { skipped: true };
            running = true;
            try {
                return await drainBulkLane(injector.get(IntegrationInboxProcessorService));
            } finally {
                running = false;
            }
        },
    });
}

async function drainBulkLane(
    processor: IntegrationInboxProcessorService,
): Promise<{ processed: number; failed: number }> {
    let totalProcessed = 0;
    let totalFailed = 0;
    const startedAt = Date.now();
    // Also passed into processPendingBatch to bound one slow batch's own loop (#149).
    const deadlineMs = startedAt + INBOX_BULK_WALL_CLOCK_BUDGET_MS;
    // Wall-clock bound, not just 'batch not full', keeps this run within its scheduler timeout
    // Backlog size only adds ticks; the run never gets stuck or orphaned
    for (;;) {
        const { processed, failed, claimed } = await processor.processPendingBatch(
            [...INBOX_BULK_STREAMS],
            INBOX_BULK_BATCH_SIZE_DEFAULT,
            deadlineMs,
        );
        totalProcessed += processed;
        totalFailed += failed;
        if (claimed < INBOX_BULK_BATCH_SIZE_DEFAULT) break;
        if (Date.now() >= deadlineMs) break;
    }
    if (totalProcessed > 0 || totalFailed > 0) {
        Logger.verbose(
            `Integration inbox bulk-lane sweep: ${totalProcessed} processed, ${totalFailed} failed/retrying`,
            loggerCtx,
        );
    }
    return { processed: totalProcessed, failed: totalFailed };
}

// Touches only 'processed' rows so it can never compete with a pending/processing claim
// Wall-clock bounded like the bulk lane: a large backlog just means more ticks
export function createIntegrationInboxRetentionTask(
    options: ErpIntegrationPluginOptions,
): ScheduledTask {
    const everyMs = options.inboxRetentionIntervalMs ?? INBOX_RETENTION_INTERVAL_DEFAULT;
    return new ScheduledTask({
        id: 'erp-integration-inbox-retention',
        description:
            'Tombstones superseded processed inbox rows, keeping only the latest version per (stream, entityId) (central hub only).',
        schedule: cronEveryMs(everyMs),
        execute: async ({ injector }) => {
            if (options.instanceType !== 'central') return { skipped: true };

            const inbox = injector.get(IntegrationInboxRetentionService);
            let totalTombstoned = 0;
            const startedAt = Date.now();
            for (;;) {
                const tombstoned = await inbox.purgeSupersededProcessedRows();
                totalTombstoned += tombstoned;
                if (tombstoned === 0) break;
                if (Date.now() - startedAt >= INBOX_RETENTION_WALL_CLOCK_BUDGET_MS) break;
            }
            if (totalTombstoned > 0) {
                Logger.verbose(
                    `Integration inbox retention sweep: tombstoned ${totalTombstoned} superseded processed row(s)`,
                    loggerCtx,
                );
            }
            return { tombstoned: totalTombstoned };
        },
    });
}

const REPLAY_SWEEP_INTERVAL_MS = 5 * 60_000;

export function createIntegrationInboxReplaySweepTask(
    options: ErpIntegrationPluginOptions,
): ScheduledTask {
    return new ScheduledTask({
        id: 'erp-integration-inbox-replay-sweep',
        description:
            'Returns replay_requested inbox rows to failed when the replayed event failed or never arrived (central hub only).',
        schedule: cronEveryMs(REPLAY_SWEEP_INTERVAL_MS),
        execute: async ({ injector }) => {
            if (options.instanceType !== 'central') return { skipped: true };
            const expired = await injector.get(IntegrationInboxReplayStateService).expireStale();
            if (expired > 0) {
                Logger.verbose(`Inbox replay sweep: ${expired} row(s) back to failed`, loggerCtx);
            }
            return { expired };
        },
    });
}
