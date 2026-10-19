import { Injectable } from '@nestjs/common';
import { RequestContextService, TransactionalConnection } from '@vendure/core';
import type { RequestContext } from '@vendure/core';
import { ctxQuery } from 'shared';

import { IntegrationOutboxEntry } from './entities/integration-outbox-entry.entity';
import { KafkaProducerService } from './kafka-producer.service';
import { decideOutboxFailure } from './retry-policy';

const BATCH_SIZE = 50;

// Kept apart from the BullMQ scheduler wiring so tests call processPendingBatch directly,
// without waiting on a real scheduler interval. See docs/testing-strategy.md, Worker testing.
@Injectable()
export class IntegrationOutboxProcessorService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly kafkaProducer: KafkaProducerService,
        private readonly requestContextService: RequestContextService,
    ) {}

    async processPendingBatch(): Promise<void> {
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const due = await ctxQuery<Array<{ id: string }>>(
            this.connection,
            ctx,
            `SELECT id FROM integration_outbox
             WHERE status = 'pending' AND (next_retry_at IS NULL OR next_retry_at <= now())
             ORDER BY created_at ASC, id ASC LIMIT $1`,
            [BATCH_SIZE],
        );
        for (const { id } of due) {
            await this.processOne(ctx, Number(id));
        }
    }

    // The row lock is held across the publish on purpose (serialized per row, concurrency.md rule
    // g): a concurrent sweep skips it and a concurrent requeue waits for the commit.
    private async processOne(ctx: RequestContext, id: number): Promise<void> {
        await this.connection.withTransaction(ctx, async txCtx => {
            const repo = this.connection.getRepository(txCtx, IntegrationOutboxEntry);
            const entry = await repo
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
                await repo.update(entry.id, {
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
                await repo.update(entry.id, {
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
