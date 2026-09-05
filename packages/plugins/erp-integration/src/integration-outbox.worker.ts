import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';

import { IntegrationOutboxProcessorService } from './integration-outbox-processor.service';
import {
    ERP_INTEGRATION_PLUGIN_OPTIONS,
    KAFKA_ENABLED_DEFAULT,
    OUTBOX_POLL_INTERVAL_DEFAULT,
} from './types';
import type { ErpIntegrationPluginOptions } from './types';

const QUEUE_NAME = 'erp-integration-outbox';

// Central-hub-only, unlike plugin-sync's OutboxWorker (which drains on every instance) — a
// branch never publishes directly to Integration Service, per the external-integration-rules skill. Also
// gated on kafkaEnabled (issue #68) — a plain `make dev` (local contour) must never publish to a
// real Integration Service broker. Both checks live in this class's own onModuleInit, same
// lifecycle-hook-runtime pattern as KafkaConsumerBootstrapService — see erp-integration.plugin.ts
// for why the guard can't live at the module/providers level instead.
@Injectable()
export class IntegrationOutboxWorker implements OnModuleInit, OnModuleDestroy {
    private queue: Queue | undefined;
    private worker: Worker | undefined;

    constructor(
        private readonly processor: IntegrationOutboxProcessorService,
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
    ) {}

    async onModuleInit(): Promise<void> {
        if (this.options.instanceType !== 'central') return;
        // Issue #68: never publish to a real Integration Service broker unless the contour
        // explicitly opts in — this worker is what drives KafkaProducerService.publish().
        if (!(this.options.kafkaEnabled ?? KAFKA_ENABLED_DEFAULT)) return;

        const connection = {
            host: this.options.redis.host,
            port: this.options.redis.port,
            password: this.options.redis.password,
            db: this.options.redis.db,
        };
        this.queue = new Queue(QUEUE_NAME, { connection });
        this.worker = new Worker(QUEUE_NAME, async () => this.processor.processPendingBatch(), {
            connection,
        });

        const everyMs = this.options.outboxPollIntervalMs ?? OUTBOX_POLL_INTERVAL_DEFAULT;
        await this.queue.upsertJobScheduler('sweep', { every: everyMs });
    }

    async onModuleDestroy(): Promise<void> {
        await this.worker?.close();
        await this.queue?.close();
    }
}
