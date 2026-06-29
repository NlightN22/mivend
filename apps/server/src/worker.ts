import { bootstrapWorker } from '@vendure/core';
import { config } from './vendure-config';

bootstrapWorker(config).catch(err => {
    console.error(err);
    process.exit(1);
});
