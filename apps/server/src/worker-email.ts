import { bootstrapWorker } from '@vendure/core';
import { config } from './vendure-config';
import { assertDatabaseLocale } from './db-locale-check';

// Isolated so stuck jobs in other queues can't starve password-reset emails — see the
// vendure-workers skill.
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
