import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Logger } from '@vendure/core';
import { Queue, Worker } from 'bullmq';

import { ReservationExpiryService } from './reservation-expiry.service';
import { EXPIRY_POLL_INTERVAL_DEFAULT, RESERVATION_PLUGIN_OPTIONS, loggerCtx } from './types';
import type { ReservationPluginOptions } from './types';

const QUEUE_NAME = 'reservation-expiry';

// Mirrors OutboxWorker (packages/plugins/sync/src/outbox.worker.ts) — raw BullMQ Queue+Worker
// with upsertJobScheduler for periodic execution, not Vendure's JobQueueService (no plugin in
// this codebase uses that API; this is the established pattern to follow).
@Injectable()
export class ReservationExpiryWorker implements OnModuleInit, OnModuleDestroy {
    private queue!: Queue;
    private worker!: Worker;

    constructor(
        private readonly reservationExpiryService: ReservationExpiryService,
        @Inject(RESERVATION_PLUGIN_OPTIONS) private readonly options: ReservationPluginOptions,
    ) {}

    async onModuleInit(): Promise<void> {
        const connection = {
            host: this.options.redis.host,
            port: this.options.redis.port,
            password: this.options.redis.password,
        };

        this.queue = new Queue(QUEUE_NAME, { connection });
        this.worker = new Worker(
            QUEUE_NAME,
            async () => {
                const expired = await this.reservationExpiryService.expireDueReservations();
                if (expired > 0) {
                    Logger.verbose(`Expired ${expired} due reservation(s)`, loggerCtx);
                }
            },
            { connection },
        );

        this.worker.on('failed', (_job, err) => {
            Logger.error(`Reservation expiry job failed: ${err.message}`, loggerCtx);
        });

        const everyMs = this.options.expiryPollIntervalMs ?? EXPIRY_POLL_INTERVAL_DEFAULT;
        await this.queue.upsertJobScheduler('expire', { every: everyMs });

        Logger.info(`ReservationExpiryWorker started (every=${everyMs}ms)`, loggerCtx);
    }

    async onModuleDestroy(): Promise<void> {
        await this.worker?.close();
        await this.queue?.close();
    }
}
