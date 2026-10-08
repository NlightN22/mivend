import { Logger, ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { IntegrationInboxProcessorService } from './integration-inbox-processor.service';
import { IntegrationInboxReplayStateService } from './integration-inbox-replay-state.service';
import { IntegrationInboxService } from './integration-inbox.service';
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

// Central-hub-only, mirroring the outbox task. Issue #80: standard for recurring/periodic
// plugin work is Vendure's own ScheduledTask (DefaultSchedulerPlugin, registered in
// apps/server/src/vendure-config.ts) — worker-process-only and DB-locked out of the box, plus
// enable/disable + run-now via the admin API, replacing the previous raw BullMQ Queue+Worker
// (integration-inbox.worker.ts).
//
// Issue #93: split into independent lanes so a large bulk backlog (a full price/stock resync,
// hundreds of thousands of rows) can never starve order-registration-result, which reservation
// release depends on (OrderRegistrationResultHandler). Every lane claims from the same
// IntegrationInboxEvent table but with disjoint `stream` filters, so a row is claimed by exactly
// one lane.
//
// Issue #127: this used to be a single "critical" lane shared with 'user' (added to fix a
// separate head-of-line-blocking incident — see INBOX_USER_STREAMS' own comment in types.ts).
// Sharing one lane/one claimBatch query between the two would have just relocated the original
// #93 problem: a large 'user' backlog could then starve order-registration-result the exact same
// way 'counterparty' once starved 'user'. Kept as two fully independent, single-stream lanes
// instead (see createIntegrationInboxUserTask below) — order-registration-result's own claim
// query never has to share a batch, or an ORDER BY, with any other stream, critical or bulk.
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

// Issue #127: 'user' gets its own lane, deliberately not merged into the order-registration-result
// lane above (see that function's own comment for why) and not left in the bulk lane (the original
// starvation incident this fixes). No reclaim-while-full loop here, same as the
// order-registration-result lane — 'user' is expected to stay low-volume; if it ever needs one,
// add it the same way the bulk lane has it, budget-bounded.
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
            // Also passed into processPendingBatch to bound one slow batch's own loop (#149).
            const deadlineMs = startedAt + INBOX_BULK_WALL_CLOCK_BUDGET_MS;
            // Immediate reclaim while a batch comes back full (queue likely still has more
            // pending) instead of waiting out the fixed poll interval — only falls back to the
            // normal interval once a batch comes back partial/empty or the wall-clock budget is
            // spent. Bounding by wall-clock (not just "batch not full") guarantees this execution
            // finishes within its own scheduler timeout no matter how large the backlog is —
            // an unbounded backlog just means more ticks, not a stuck/orphaned task.
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
        },
    });
}

// Retention (#147): a separate, low-frequency lane that only tombstones `processed` rows, never
// touching `pending`/`processing`, so it can't compete with a claim. Loops within one tick, same
// wall-clock-bounded shape as the bulk claim lane, so a resync-sized backlog just means more ticks.
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

            const inbox = injector.get(IntegrationInboxService);
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
