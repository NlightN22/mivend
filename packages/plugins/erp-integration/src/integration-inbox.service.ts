import { Injectable } from '@nestjs/common';
import type { PaginatedList } from '@vendure/core';
import { Brackets, DataSource } from 'typeorm';

import { IntegrationInboxEvent } from './entities/integration-inbox-event.entity';
import type { IntegrationInboxEventStatus } from './entities/integration-inbox-event.entity';
import { INBOX_MAX_ATTEMPTS_DEFAULT } from './types';
import type { InboundStream } from './types';

const POSTGRES_UNIQUE_VIOLATION = '23505';

// A row stuck in 'processing' this long was abandoned by a crashed/killed worker — reclaim it on
// the next sweep. Mirrors plugin-acquiring's InboxService (STUCK_PROCESSING_THRESHOLD_MS).
const STUCK_PROCESSING_THRESHOLD_MS = 5 * 60 * 1000;

const FAILED_EVENTS_MAX_TAKE = 100;

export interface EnqueueInboxEventInput {
    stream: InboundStream;
    entityId: string;
    version: string;
    sourceEventId: string;
    payload: Record<string, unknown>;
}

export interface FailedInboxEventListOptions {
    take?: number;
    skip?: number;
}

export interface IntegrationInboxBacklogByStream {
    stream: InboundStream;
    pending: number;
    processing: number;
    failed: number;
}

// The durable inbox for inbound Kafka events from Integration Service (issue #62 Milestone 1).
// Mirrors plugin-acquiring's InboxService shape (enqueue/claimBatch/markProcessed/markFailed with
// SELECT ... FOR UPDATE SKIP LOCKED) — same architectural pattern, different entity/dedup key.
@Injectable()
export class IntegrationInboxService {
    constructor(private readonly dataSource: DataSource) {}

    // Called from the Kafka consumer only — never processes anything itself. Returns the
    // existing row (a no-op) on a duplicate (stream, sourceEventId), so the consumer can ack the
    // Kafka message unconditionally after this resolves without throwing.
    //
    // Issue #89: dedup key is (stream, sourceEventId), not (stream, entityId, version) — `version`
    // is Integration Service's own entity-level timestamp, not a per-message id, and two distinct
    // events for the same entity can legitimately share a version value (confirmed live: a
    // backfilled deactivation event collided with an earlier, unrelated update's version — the old
    // key silently discarded the newer message). `sourceEventId` is the real per-message identity;
    // `version` stays the separate out-of-order/regression guard used by
    // isSupersededByNewerVersion (integration-inbox-processor.service.ts), untouched by this key.
    async enqueue(input: EnqueueInboxEventInput): Promise<IntegrationInboxEvent> {
        const repo = this.dataSource.getRepository(IntegrationInboxEvent);
        const existing = await repo.findOne({
            where: { stream: input.stream, sourceEventId: input.sourceEventId },
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
                    where: { stream: input.stream, sourceEventId: input.sourceEventId },
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
    // `streams`, when given, restricts claiming to those streams only — the priority-lane split
    // (issue #93): each lane's own scheduled task passes its own disjoint stream set, so a large
    // bulk backlog can never be claimed ahead of (or in the same batch as) a critical-lane row.
    async claimBatch(limit = 20, streams?: InboundStream[]): Promise<IntegrationInboxEvent[]> {
        const outerRepo = this.dataSource.getRepository(IntegrationInboxEvent);
        return outerRepo.manager.transaction(async manager => {
            const repo = manager.getRepository(outerRepo.target);
            const qb = repo.createQueryBuilder('event').where(
                new Brackets(qb => {
                    qb.where('event.status = :pending', { pending: 'pending' }).orWhere(
                        `event.status = :processing AND event.updatedAt < now() - (:staleMs || ' milliseconds')::interval`,
                        { processing: 'processing', staleMs: STUCK_PROCESSING_THRESHOLD_MS },
                    );
                }),
            );
            if (streams && streams.length > 0) {
                qb.andWhere('event.stream IN (:...streams)', { streams });
            }
            const rows = await qb
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

    // Dashboard/ops read model (issue #76) — 'failed' rows are dead-lettered (markFailed above)
    // and need a human to notice and act; never fed back into claimBatch automatically.
    async findFailed(
        options?: FailedInboxEventListOptions,
    ): Promise<PaginatedList<IntegrationInboxEvent>> {
        const take = Math.min(options?.take ?? 20, FAILED_EVENTS_MAX_TAKE);
        const skip = options?.skip ?? 0;

        const [items, totalItems] = await this.dataSource
            .getRepository(IntegrationInboxEvent)
            .createQueryBuilder('event')
            .where('event.status = :status', { status: 'failed' })
            .orderBy('event.updatedAt', 'DESC')
            .addOrderBy('event.id', 'DESC')
            .take(take)
            .skip(skip)
            .getManyAndCount();

        return { items, totalItems };
    }

    // Dashboard read model (issue #91's "integration health" page) — how many rows per stream are
    // sitting unprocessed right now. Deliberately a different question from Kafka lag: these rows
    // were already consumed from Kafka and had their offset committed — this is Postgres-side
    // processing backlog, not broker-side lag, and the two numbers are expected to disagree (a
    // consumer can be fully caught up with Kafka while a huge inbox backlog waits on a slow/backed
    // up processor, or vice versa during a burst).
    async getBacklogByStream(): Promise<IntegrationInboxBacklogByStream[]> {
        const rows = await this.dataSource
            .getRepository(IntegrationInboxEvent)
            .createQueryBuilder('event')
            .select('event.stream', 'stream')
            .addSelect('event.status', 'status')
            .addSelect('COUNT(*)', 'count')
            .where('event.status IN (:...statuses)', {
                statuses: ['pending', 'processing', 'failed'],
            })
            .groupBy('event.stream')
            .addGroupBy('event.status')
            .getRawMany<{
                stream: InboundStream;
                status: IntegrationInboxEventStatus;
                count: string;
            }>();

        const byStream = new Map<InboundStream, IntegrationInboxBacklogByStream>();
        for (const row of rows) {
            const entry = byStream.get(row.stream) ?? {
                stream: row.stream,
                pending: 0,
                processing: 0,
                failed: 0,
            };
            entry[row.status as 'pending' | 'processing' | 'failed'] = Number(row.count);
            byStream.set(row.stream, entry);
        }
        return [...byStream.values()];
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
