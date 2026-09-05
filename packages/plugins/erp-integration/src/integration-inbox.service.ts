import { Injectable } from '@nestjs/common';
import { Brackets, DataSource } from 'typeorm';

import { IntegrationInboxEvent } from './entities/integration-inbox-event.entity';
import { INBOX_MAX_ATTEMPTS_DEFAULT } from './types';
import type { InboundStream } from './types';

const POSTGRES_UNIQUE_VIOLATION = '23505';

// A row stuck in 'processing' this long was abandoned by a crashed/killed worker — reclaim it on
// the next sweep. Mirrors plugin-acquiring's InboxService (STUCK_PROCESSING_THRESHOLD_MS).
const STUCK_PROCESSING_THRESHOLD_MS = 5 * 60 * 1000;

export interface EnqueueInboxEventInput {
    stream: InboundStream;
    entityId: string;
    version: string;
    sourceEventId: string;
    payload: Record<string, unknown>;
}

// The durable inbox for inbound Kafka events from Integration Service (issue #62 Milestone 1).
// Mirrors plugin-acquiring's InboxService shape (enqueue/claimBatch/markProcessed/markFailed with
// SELECT ... FOR UPDATE SKIP LOCKED) — same architectural pattern, different entity/dedup key.
@Injectable()
export class IntegrationInboxService {
    constructor(private readonly dataSource: DataSource) {}

    // Called from the Kafka consumer only — never processes anything itself. Returns the
    // existing row (a no-op) on a duplicate (stream, entityId, version), so the consumer can ack
    // the Kafka message unconditionally after this resolves without throwing.
    async enqueue(input: EnqueueInboxEventInput): Promise<IntegrationInboxEvent> {
        const repo = this.dataSource.getRepository(IntegrationInboxEvent);
        const existing = await repo.findOne({
            where: { stream: input.stream, entityId: input.entityId, version: input.version },
        });
        if (existing) return existing;

        try {
            return await repo.save(
                repo.create({
                    stream: input.stream,
                    entityId: input.entityId,
                    version: input.version,
                    sourceEventId: input.sourceEventId,
                    payload: input.payload,
                    status: 'pending',
                    attempts: 0,
                }),
            );
        } catch (err) {
            if (this.isUniqueViolation(err)) {
                return (await repo.findOne({
                    where: {
                        stream: input.stream,
                        entityId: input.entityId,
                        version: input.version,
                    },
                }))!;
            }
            throw err;
        }
    }

    // Claims a batch of pending (or abandoned-processing) rows for the periodic sweep.
    // SELECT ... FOR UPDATE SKIP LOCKED inside one transaction — not find()+save() — is what
    // actually prevents two concurrent sweeps from claiming the same row (same fix as
    // plugin-acquiring's InboxService.claimBatch, referenced by AGENTS.md's test-design guidance
    // for this issue).
    async claimBatch(limit = 20): Promise<IntegrationInboxEvent[]> {
        const outerRepo = this.dataSource.getRepository(IntegrationInboxEvent);
        return outerRepo.manager.transaction(async manager => {
            const repo = manager.getRepository(outerRepo.target);
            const rows = await repo
                .createQueryBuilder('event')
                .where(
                    new Brackets(qb => {
                        qb.where('event.status = :pending', { pending: 'pending' }).orWhere(
                            `event.status = :processing AND event.updatedAt < now() - (:staleMs || ' milliseconds')::interval`,
                            { processing: 'processing', staleMs: STUCK_PROCESSING_THRESHOLD_MS },
                        );
                    }),
                )
                .orderBy('event.createdAt', 'ASC')
                .take(limit)
                .setLock('pessimistic_write')
                .setOnLocked('skip_locked')
                .getMany();
            if (rows.length === 0) return rows;
            for (const row of rows) {
                row.status = 'processing';
            }
            await repo.save(rows);
            return rows;
        });
    }

    async markProcessed(id: number): Promise<void> {
        await this.dataSource
            .getRepository(IntegrationInboxEvent)
            .update({ id }, { status: 'processed', processedAt: new Date() });
    }

    // Failure -> back to 'pending' for the next sweep (the retry-with-backoff comes from the
    // sweep interval itself, same as plugin-acquiring), or 'failed' (dead-letter) once
    // maxAttempts is exhausted (the external-integration-rules skill's no-silent-drops/async-inbox rules — bounded retry, no
    // infinite loop).
    async markFailed(
        id: number,
        error: Error,
        maxAttempts = INBOX_MAX_ATTEMPTS_DEFAULT,
    ): Promise<void> {
        const repo = this.dataSource.getRepository(IntegrationInboxEvent);
        const row = await repo.findOneOrFail({ where: { id } });
        const attempts = row.attempts + 1;
        await repo.update(
            { id },
            {
                attempts,
                lastError: error.message,
                status: attempts >= maxAttempts ? 'failed' : 'pending',
            },
        );
    }

    private isUniqueViolation(err: unknown): boolean {
        return (
            typeof err === 'object' &&
            err !== null &&
            'code' in err &&
            (err as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION
        );
    }
}
