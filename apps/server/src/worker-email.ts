import { bootstrapWorker } from '@vendure/core';
import { config } from './vendure-config';

// Dedicated worker for the `send-email` queue only (issue #119/#120's live incident, 2026-09-20:
// three stuck built-in `apply-collection-filters` jobs occupied every one of worker.ts's default
// 3 concurrency slots, blocking password-reset emails from ever sending). `activeQueues` is a
// real, documented Vendure mechanism (JobQueueOptions.activeQueues) — but it only takes effect
// safely when paired with worker.ts's own explicit, non-overlapping activeQueues list (see that
// file's comment for why "this one restricted + that one left on the default 'all'" actively
// fails jobs instead of coexisting). See issue #81 (closed) for why a fuller
// Docker-container-per-queue-group split was decided against — this is a narrower, additive fix
// for one specific queue, not that broader redesign. See also the `vendure-workers` skill for
// the general pattern/gotchas before touching either worker file again.
bootstrapWorker({
    ...config,
    jobQueueOptions: { ...(config.jobQueueOptions ?? {}), activeQueues: ['send-email'] },
})
    .then(worker => worker.startJobQueue())
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
