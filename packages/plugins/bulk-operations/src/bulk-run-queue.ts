import { Injectable, OnModuleInit } from '@nestjs/common';
import { JobQueue, JobQueueService, RequestContext } from '@vendure/core';
import type { SerializedRequestContext } from '@vendure/core/dist/api/common/request-context';

import { BulkBatchRunner } from './bulk-batch-runner';
import { BULK_RUN_QUEUE } from './types';

interface RunJobData {
    uuid: string;
    ctx: SerializedRequestContext;
}

// Vendure's DB-backed job queue: the existing worker process picks it up (listed in worker.ts).
@Injectable()
export class BulkRunQueue implements OnModuleInit {
    private queue!: JobQueue<RunJobData>;

    constructor(
        private jobQueueService: JobQueueService,
        private runner: BulkBatchRunner,
    ) {}

    async onModuleInit(): Promise<void> {
        this.queue = await this.jobQueueService.createQueue({
            name: BULK_RUN_QUEUE,
            process: job =>
                this.runner.execute(RequestContext.deserialize(job.data.ctx), job.data.uuid),
        });
    }

    async enqueue(ctx: RequestContext, uuid: string): Promise<void> {
        await this.queue.add({ uuid, ctx: ctx.serialize() }, { retries: 0 });
    }
}
