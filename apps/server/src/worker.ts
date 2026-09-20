import { bootstrapWorker } from '@vendure/core';
import { config } from './vendure-config';

// Every known JobQueueService queue in this codebase EXCEPT `send-email` (that one is owned
// exclusively by worker-email.ts — see its own doc comment). Since issue #128's migration off
// BullMQJobQueuePlugin to Vendure's own DefaultJobQueuePlugin (SqlJobQueueStrategy), this list
// gives genuine per-process isolation: activeQueues is a real `WHERE queueName = ...` filter at
// the query level, not a post-dequeue check, so a worker never dequeues a job type it doesn't
// declare here. Kept as an explicit, non-overlapping list (rather than "this worker keeps
// everything, that one also takes send-email") for clarity and because it's what worked under
// BullMQ too — see the vendure-workers skill for the historical incident this split fixed.
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
