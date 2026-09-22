import { bootstrapWorker } from '@vendure/core';
import { config } from './vendure-config';
import { assertDatabaseLocale } from './db-locale-check';

// Dedicated worker for the `send-email` queue only (issue #119/#120's live incident, 2026-09-20:
// three stuck built-in `apply-collection-filters` jobs occupied every one of worker.ts's default
// 3 concurrency slots, blocking password-reset emails from ever sending). Since issue #128's
// migration to Vendure's DefaultJobQueuePlugin (SqlJobQueueStrategy), `activeQueues` gives real
// per-process isolation via a `WHERE queueName = ...` filter — no longer dependent on pairing
// with worker.ts's own non-overlapping list to avoid the BullMQ-specific dequeue race described
// in the vendure-workers skill's historical section. See issue #81 (closed) for why a fuller
// Docker-container-per-queue-group split was decided against — this is a narrower, additive fix
// for one specific queue, not that broader redesign.
assertDatabaseLocale()
    .then(() =>
        bootstrapWorker({
            ...config,
            jobQueueOptions: { ...(config.jobQueueOptions ?? {}), activeQueues: ['send-email'] },
        }),
    )
    .then(worker => worker.startJobQueue())
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
