import { bootstrapWorker } from '@vendure/core';
import { config } from './vendure-config';
import { assertDatabaseLocale } from './db-locale-check';

// Must not overlap worker-email.ts's `send-email` — see the vendure-workers skill.
const ALL_QUEUES_EXCEPT_EMAIL = [
    'apply-collection-filters', // Vendure core (CollectionService)
    'clean-sessions', // Vendure core (SessionService)
    'update-search-index', // Vendure core (DefaultSearchPlugin), listed so it's never orphaned
    'generate-document', // this project's own (plugin-documents, PdfGeneratorService)
];

assertDatabaseLocale()
    .then(() =>
        bootstrapWorker({
            ...config,
            jobQueueOptions: {
                ...(config.jobQueueOptions ?? {}),
                activeQueues: ALL_QUEUES_EXCEPT_EMAIL,
            },
        }),
    )
    .then(worker => worker.startJobQueue())
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
