import { Injectable } from '@nestjs/common';
import { DataSource, IsNull, LessThanOrEqual } from 'typeorm';

import { IntegrationOutboxEntry } from './entities/integration-outbox-entry.entity';
import { KafkaProducerService } from './kafka-producer.service';
import { decideOutboxFailure } from './retry-policy';

// Split from the BullMQ scheduling wiring (integration-outbox.worker.ts) so tests can invoke
// `processPendingBatch` directly — never waiting on a real scheduler interval, per
// docs/testing-strategy.md's "Worker testing".
@Injectable()
export class IntegrationOutboxProcessorService {
    constructor(
        private readonly dataSource: DataSource,
        private readonly kafkaProducer: KafkaProducerService,
    ) {}

    async processPendingBatch(): Promise<void> {
        const repo = this.dataSource.getRepository(IntegrationOutboxEntry);
        const pending = await repo.find({
            where: [
                { status: 'pending', nextRetryAt: IsNull() },
                { status: 'pending', nextRetryAt: LessThanOrEqual(new Date()) },
            ],
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
            const now = new Date();
            entry.retryCount += 1;
            entry.lastError = err instanceof Error ? err.message : String(err);
            entry.lastErrorAt = now;
            entry.firstFailedAt ??= now;
            // Backoff over hours; a 'failed' row is terminal until requeued
            // (IntegrationOutboxRecoveryService), and processPendingBatch never picks it up.
            const decision = decideOutboxFailure(now, entry.firstFailedAt, entry.retryCount);
            entry.status = decision.status;
            entry.nextRetryAt = decision.status === 'pending' ? decision.nextRetryAt : null;
            await repo.save(entry);
        }
    }
}
