import {
    DefaultSchedulerPlugin,
    bootstrapWorker,
    type SchedulerStrategy,
    type TaskReport,
} from '@vendure/core';

import { config } from '../../../vendure-config';

// Renders document PDFs and applies collection filters only: scheduled tasks would change seeded rows under the specs.
const idleScheduler: SchedulerStrategy = {
    executeTask: () => () => undefined,
    getTasks: async () => [],
    getTask: async () => undefined,
    triggerTask: async () => undefined,
    updateTask: async (): Promise<TaskReport> => {
        throw new Error('The access PDF worker runs no scheduled tasks');
    },
};

bootstrapWorker({
    ...config,
    plugins: (config.plugins ?? []).filter(plugin => plugin !== DefaultSchedulerPlugin),
    schedulerOptions: { ...config.schedulerOptions, schedulerStrategy: idleScheduler },
    jobQueueOptions: {
        ...config.jobQueueOptions,
        activeQueues: ['generate-document', 'apply-collection-filters'],
    },
})
    .then(worker => worker.startJobQueue())
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
