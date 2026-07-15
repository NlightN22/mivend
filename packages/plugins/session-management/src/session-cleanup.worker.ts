import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Logger } from '@vendure/core';
import { Queue, Worker } from 'bullmq';

import { SessionManagementService } from './session-management.service';
import {
    CLEANUP_POLL_INTERVAL_DEFAULT,
    SESSION_MANAGEMENT_PLUGIN_OPTIONS,
    loggerCtx,
} from './session.types';
import type { SessionManagementPluginOptions } from './session.types';

const QUEUE_NAME = 'session-cleanup';

// Mirrors ReservationExpiryWorker (packages/plugins/reservation/src/reservation-expiry.worker.ts)
// — raw BullMQ Queue+Worker with upsertJobScheduler for periodic execution, the established
// pattern for recurring jobs in this codebase (no plugin uses Vendure's JobQueueService or its
// native ScheduledTask API for this).
@Injectable()
export class SessionCleanupWorker implements OnModuleInit, OnModuleDestroy {
    private queue!: Queue;
    private worker!: Worker;

    constructor(
        private readonly sessionManagementService: SessionManagementService,
        @Inject(SESSION_MANAGEMENT_PLUGIN_OPTIONS)
        private readonly options: SessionManagementPluginOptions,
    ) {}

    async onModuleInit(): Promise<void> {
        const connection = {
            host: this.options.redis.host,
            port: this.options.redis.port,
            password: this.options.redis.password,
            db: this.options.redis.db,
        };

        this.queue = new Queue(QUEUE_NAME, { connection });
        this.worker = new Worker(
            QUEUE_NAME,
            async () => {
                const deleted = await this.sessionManagementService.deleteExpiredSessions();
                if (deleted > 0) {
                    Logger.verbose(`Deleted ${deleted} expired session(s)`, loggerCtx);
                }
            },
            { connection },
        );

        this.worker.on('failed', (_job, err) => {
            Logger.error(`Session cleanup job failed: ${err.message}`, loggerCtx);
        });

        const everyMs = this.options.cleanupPollIntervalMs ?? CLEANUP_POLL_INTERVAL_DEFAULT;
        await this.queue.upsertJobScheduler('cleanup', { every: everyMs });

        Logger.info(`SessionCleanupWorker started (every=${everyMs}ms)`, loggerCtx);
    }

    async onModuleDestroy(): Promise<void> {
        await this.worker?.close();
        await this.queue?.close();
    }
}
