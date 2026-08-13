import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Logger } from '@vendure/core';
import { Queue, Worker } from 'bullmq';

import { IntegrationInboxProcessorService } from './integration-inbox-processor.service';
import { ERP_INTEGRATION_PLUGIN_OPTIONS, INBOX_POLL_INTERVAL_DEFAULT, loggerCtx } from './types';
import type { ErpIntegrationPluginOptions } from './types';

const QUEUE_NAME = 'erp-integration-inbox';

// Central-hub-only, mirroring IntegrationOutboxWorker — guarded here (unlike
// IntegrationOutboxWorker's comment, which guards at the plugin module level for the outbox) so
// this stays consistent with the Kafka consumer's own instanceType check in
// kafka-consumer-bootstrap.service.ts. Same BullMQ Queue+Worker+upsertJobScheduler shape as
// PaymentInboxWorker/ReservationExpiryWorker/OutboxWorker — no plugin uses Vendure's
// JobQueueService for recurring work.
@Injectable()
export class IntegrationInboxWorker implements OnModuleInit, OnModuleDestroy {
    private queue: Queue | undefined;
    private worker: Worker | undefined;

    constructor(
        private readonly processor: IntegrationInboxProcessorService,
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
    ) {}

    async onModuleInit(): Promise<void> {
        if (this.options.instanceType !== 'central') return;

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
                const { processed, failed } = await this.processor.processPendingBatch();
                if (processed > 0 || failed > 0) {
                    Logger.verbose(
                        `Integration inbox sweep: ${processed} processed, ${failed} failed/retrying`,
                        loggerCtx,
                    );
                }
            },
            { connection },
        );
        this.worker.on('failed', (_job, err) => {
            Logger.error(`Integration inbox sweep job failed: ${err.message}`, loggerCtx);
        });

        const everyMs = this.options.inboxPollIntervalMs ?? INBOX_POLL_INTERVAL_DEFAULT;
        await this.queue.upsertJobScheduler('sweep', { every: everyMs });
    }

    async onModuleDestroy(): Promise<void> {
        await this.worker?.close();
        await this.queue?.close();
    }
}
