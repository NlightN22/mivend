import { bootstrapWorker } from '@vendure/core';
import { config } from './vendure-config';

// Every known JobQueueService queue in this codebase EXCEPT `send-email` (that one is owned
// exclusively by worker-email.ts — see its own doc comment for why the split needs to be this
// explicit, not "this worker keeps everything, that one also takes send-email"). Real incident
// (2026-09-20): a naive dedicated email worker with activeQueues: ['send-email'] run *alongside*
// this worker left with no activeQueues (Vendure's "empty = all" default) actively raced this
// worker for every job type — activeQueues is checked only after a job is already dequeued from
// the single shared BullMQ list, not before, so a worker that doesn't own a job type it happens
// to pull FAILS it outright rather than leaving it for the right worker. Four real
// apply-collection-filters jobs were permanently failed this way within seconds. The only safe
// pattern is every concurrently-running worker declaring an explicit, non-overlapping
// activeQueues set — never one restricted worker paired with one left on the "all" default.
const ALL_QUEUES_EXCEPT_EMAIL = [
    'apply-collection-filters', // Vendure core (CollectionService)
    'clean-sessions', // Vendure core (SessionService)
    'update-search-index', // Vendure core (DefaultSearchPlugin) — unused by this project's own
    // custom search plugin today, listed anyway so it's never silently
    // orphaned if that ever changes
    'generate-document', // this project's own (plugin-documents, PdfGeneratorService)
];

bootstrapWorker({
    ...config,
    jobQueueOptions: { ...(config.jobQueueOptions ?? {}), activeQueues: ALL_QUEUES_EXCEPT_EMAIL },
})
    .then(worker => worker.startJobQueue())
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
