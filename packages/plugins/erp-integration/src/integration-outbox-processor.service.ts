import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { IntegrationOutboxEntry } from './entities/integration-outbox-entry.entity';
import { KafkaProducerService } from './kafka-producer.service';
import { decideOutboxFailure } from './retry-policy';

const BATCH_SIZE = 50;

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
        const due = await this.dataSource.query<Array<{ id: string }>>(
            `SELECT id FROM integration_outbox
             WHERE status = 'pending' AND (next_retry_at IS NULL OR next_retry_at <= now())
             ORDER BY created_at ASC, id ASC LIMIT $1`,
            [BATCH_SIZE],
        );
        for (const { id } of due) {
            await this.processOne(Number(id));
        }
    }

    // The row lock is held across the publish on purpose (serialized per row, concurrency.md rule
    // g): a concurrent sweep skips it and a concurrent requeue waits for the commit.
    private async processOne(id: number): Promise<void> {
        await this.dataSource.transaction(async em => {
            const entry = await em
                .getRepository(IntegrationOutboxEntry)
                .createQueryBuilder('e')
                .setLock('pessimistic_write')
                .setOnLocked('skip_locked')
                .where(
                    `e.id = :id AND e.status = 'pending'
                     AND (e.nextRetryAt IS NULL OR e.nextRetryAt <= now())`,
                    { id },
                )
                .getOne();
            if (!entry) return;

            try {
                await this.kafkaProducer.publish(entry.eventType, entry.payload);
                await em.update(IntegrationOutboxEntry, entry.id, {
                    status: 'published',
                    publishedAt: new Date(),
                });
            } catch (err) {
                const now = new Date();
                const firstFailedAt = entry.firstFailedAt ?? now;
                const retryCount = entry.retryCount + 1;
                // Backoff over hours; a 'failed' row is terminal until requeued
                // (IntegrationOutboxRecoveryService), and the sweep never picks it up again.
                const decision = decideOutboxFailure(now, firstFailedAt, retryCount);
                await em.update(IntegrationOutboxEntry, entry.id, {
                    retryCount,
                    firstFailedAt,
                    lastError: err instanceof Error ? err.message : String(err),
                    lastErrorAt: now,
                    status: decision.status,
                    nextRetryAt: decision.status === 'pending' ? decision.nextRetryAt : null,
                });
            }
        });
    }
}
