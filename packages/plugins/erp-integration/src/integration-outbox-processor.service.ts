import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { IntegrationOutboxEntry } from './entities/integration-outbox-entry.entity';
import { KafkaProducerService } from './kafka-producer.service';
import { ERP_INTEGRATION_PLUGIN_OPTIONS, MAX_RETRY_DEFAULT } from './types';
import type { ErpIntegrationPluginOptions } from './types';
import { shouldDeadLetter } from './retry-policy';

// Split from the BullMQ scheduling wiring (integration-outbox.worker.ts) so tests can invoke
// `processPendingBatch` directly — never waiting on a real scheduler interval, per
// docs/testing-strategy.md's "Worker testing".
@Injectable()
export class IntegrationOutboxProcessorService {
    constructor(
        private readonly dataSource: DataSource,
        private readonly kafkaProducer: KafkaProducerService,
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
    ) {}

    async processPendingBatch(): Promise<void> {
        const repo = this.dataSource.getRepository(IntegrationOutboxEntry);
        const pending = await repo.find({
            where: { status: 'pending' },
            order: { createdAt: 'ASC' },
            take: 50,
        });

        for (const entry of pending) {
            await this.processOne(entry);
        }
    }

    private async processOne(entry: IntegrationOutboxEntry): Promise<void> {
        const repo = this.dataSource.getRepository(IntegrationOutboxEntry);
        try {
            await this.kafkaProducer.publish(entry.eventId, entry.eventType, entry.payload);
            entry.status = 'published';
            entry.publishedAt = new Date();
            await repo.save(entry);
        } catch (err) {
            const maxRetry = this.options.maxRetry ?? MAX_RETRY_DEFAULT;
            entry.retryCount += 1;
            entry.lastError = err instanceof Error ? err.message : String(err);
            entry.lastErrorAt = new Date();
            // Dead-letter after the bounded attempt count is exhausted (AGENTS.md rules #4/#12) —
            // a 'failed' row is terminal and is never picked up by processPendingBatch again
            // (its `where: { status: 'pending' }` excludes it). Below the limit, the row simply
            // stays 'pending' and the next sweep resumes it automatically — no bespoke recovery
            // path, same shape as PaymentInboxWorker/OutboxWorker.
            if (shouldDeadLetter(entry.retryCount, maxRetry)) {
                entry.status = 'failed';
            }
            await repo.save(entry);
        }
    }
}
