import { Logger, RequestContext, RequestContextService, ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { ChangeJournalService } from './change-journal.service';
import {
    CLEANUP_BATCH_SIZE_DEFAULT,
    CLEANUP_INTERVAL_DEFAULT_MS,
    CLEANUP_MAX_BATCHES_PER_RUN,
    loggerCtx,
    RETENTION_DAYS_DEFAULT,
} from './change-journal.types';
import type { ChangeJournalPluginOptions } from './change-journal.types';

const DAY_MS = 24 * 60 * 60_000;

// Bounded per run: a backlog only takes more runs, never one long statement.
export async function sweepChangeJournal(
    service: Pick<ChangeJournalService, 'deleteOlderThan'>,
    ctx: RequestContext,
    retentionDays: number,
    now: Date,
    batchSize = CLEANUP_BATCH_SIZE_DEFAULT,
    maxBatches = CLEANUP_MAX_BATCHES_PER_RUN,
): Promise<{ deleted: number; batches: number }> {
    const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
    let deleted = 0;
    let batches = 0;
    while (batches < maxBatches) {
        const n = await service.deleteOlderThan(ctx, cutoff, batchSize);
        batches += 1;
        deleted += n;
        if (n < batchSize) break;
    }
    return { deleted, batches };
}

export function createChangeJournalCleanupTask(options: ChangeJournalPluginOptions): ScheduledTask {
    return new ScheduledTask({
        id: 'change-journal-cleanup',
        description: 'Deletes change journal entries older than the retention period.',
        schedule: cronEveryMs(options.cleanupIntervalMs ?? CLEANUP_INTERVAL_DEFAULT_MS),
        execute: async ({ injector }) => {
            const ctx = await injector.get(RequestContextService).create({ apiType: 'admin' });
            const result = await sweepChangeJournal(
                injector.get(ChangeJournalService),
                ctx,
                options.retentionDays ?? RETENTION_DAYS_DEFAULT,
                new Date(),
            );
            if (result.deleted > 0) {
                Logger.verbose(`Deleted ${result.deleted} old change journal entries`, loggerCtx);
            }
            return result;
        },
    });
}
