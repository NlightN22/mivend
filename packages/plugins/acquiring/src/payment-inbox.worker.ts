import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Logger, RequestContextService } from '@vendure/core';
import { Queue, Worker } from 'bullmq';

import { PaymentInboxProcessorService } from './payment-inbox-processor.service';
import { ACQUIRING_PLUGIN_OPTIONS, PAYMENT_INBOX_POLL_INTERVAL_DEFAULT, loggerCtx } from './types';
import type { AcquiringPluginOptions } from './types';

const QUEUE_NAME = 'payment-inbox';

// Mirrors ReservationExpiryWorker (packages/plugins/reservation/src/reservation-expiry.worker.ts)
// and OutboxWorker (packages/plugins/sync/src/outbox.worker.ts) — raw BullMQ Queue+Worker with
// upsertJobScheduler for periodic execution, the established pattern in this codebase (no plugin
// uses Vendure's JobQueueService for recurring/timer-driven work).
@Injectable()
export class PaymentInboxWorker implements OnModuleInit, OnModuleDestroy {
    private queue!: Queue;
    private worker!: Worker;

    constructor(
        private readonly paymentInboxProcessorService: PaymentInboxProcessorService,
        private readonly requestContextService: RequestContextService,
        @Inject(ACQUIRING_PLUGIN_OPTIONS) private readonly options: AcquiringPluginOptions,
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
                const ctx = await this.requestContextService.create({ apiType: 'admin' });
                const { processed, failed } =
                    await this.paymentInboxProcessorService.processPendingEvents(ctx);
                if (processed > 0 || failed > 0) {
                    Logger.verbose(
                        `Payment inbox sweep: ${processed} processed, ${failed} failed/retrying`,
                        loggerCtx,
                    );
                }
            },
            { connection },
        );

        this.worker.on('failed', (_job, err) => {
            Logger.error(`Payment inbox sweep job failed: ${err.message}`, loggerCtx);
        });

        const everyMs =
            this.options.paymentInboxPollIntervalMs ?? PAYMENT_INBOX_POLL_INTERVAL_DEFAULT;
        await this.queue.upsertJobScheduler('sweep', { every: everyMs });

        Logger.info(`PaymentInboxWorker started (every=${everyMs}ms)`, loggerCtx);
    }

    async onModuleDestroy(): Promise<void> {
        await this.worker?.close();
        await this.queue?.close();
    }
}
