import { Injectable } from '@nestjs/common';
import type { PaginatedList } from '@vendure/core';
import { Logger } from '@vendure/core';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager, In } from 'typeorm';

const loggerCtx = 'IntegrationInboxService';

import { IntegrationInboxEvent } from './entities/integration-inbox-event.entity';
import { settleFailed, settleProcessed } from './integration-inbox-settle';
import type { BudgetExhaustedNoop, InboxOutcome } from './integration-inbox-settle';
import type { InboundStream } from './types';
import { insertRejectedInboxRow } from './integration-inbox-rejected';
import type { RejectedInboxMessage } from './integration-inbox-rejected';

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

// Same claim/ack pattern as plugin-acquiring's InboxService (SKIP LOCKED claims);
// only the entity and dedup key differ, so keep the two in step.
@Injectable()
export class IntegrationInboxService {
    constructor(private readonly dataSource: DataSource) {}

    // Dedup on (stream, sourceEventId), not version: versions can collide across distinct events.
    // Duplicates return the existing row, so the consumer can ack unconditionally.
    async enqueue(input: EnqueueInboxEventInput): Promise<IntegrationInboxEvent> {
        const repo = this.dataSource.getRepository(IntegrationInboxEvent);
        const existing = await repo.findOne({
            where: { stream: input.stream, sourceEventId: input.sourceEventId },
        });
        if (existing) {
            Logger.warn(
                `Duplicate inbox event ignored: stream=${input.stream} sourceEventId=${input.sourceEventId}`,
                loggerCtx,
            );
            return existing;
        }

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
                const race = await repo.findOne({
                    where: { stream: input.stream, sourceEventId: input.sourceEventId },
                });
                Logger.warn(
                    `Duplicate inbox event ignored (race on insert): stream=${input.stream} sourceEventId=${input.sourceEventId}`,
                    loggerCtx,
                );
                return race!;
            }
            throw err;
        }
    }

    async enqueueRejected(message: RejectedInboxMessage): Promise<void> {
        await insertRejectedInboxRow(this.dataSource, message);
    }

    // Conditional UPDATE: only a still-failed row moves, so a double click or sweep race
    // cannot dismiss the same row twice.
    async dismissFailed(id: number, reason: string): Promise<boolean> {
        const result = await this.dataSource.getRepository(IntegrationInboxEvent).update(
            { id, status: 'failed' },
            {
                status: 'processed',
                processedAt: new Date(),
                outcome: 'dismissed',
                outcomeReason: reason,
            },
        );
        return (result.affected ?? 0) > 0;
    }

    // Phase 2 repeats the eligibility condition so the lock-time recheck drops rows a competing
    // sweep already claimed (#148, see docs/environments.md's own note for the full incident).
    async claimBatch(limit = 20, streams?: InboundStream[]): Promise<IntegrationInboxEvent[]> {
        const outerRepo = this.dataSource.getRepository(IntegrationInboxEvent);
        return outerRepo.manager.transaction(async manager => {
            const repo = manager.getRepository(outerRepo.target);
            const ids = await this.findClaimCandidateIds(manager, limit, streams);
            if (ids.length === 0) return [];

            const rows = await repo
                .createQueryBuilder('event')
                .where('event.id IN (:...ids)', { ids })
                .andWhere(
                    `(event.status = 'pending' OR (event.status = 'processing' AND event.updatedAt < now() - (:staleMs || ' milliseconds')::interval))`,
                    { staleMs: STUCK_PROCESSING_THRESHOLD_MS },
                )
                .andWhere('event.eligibleAt <= now()')
                .orderBy('event.eligibleAt', 'ASC')
                .addOrderBy('event.id', 'ASC')
                .setLock('pessimistic_write')
                .setOnLocked('skip_locked')
                .getMany();
            if (rows.length === 0) return rows;
            const claimToken = randomUUID();
            for (const row of rows) {
                row.status = 'processing';
                row.claimToken = claimToken;
            }
            await repo.save(rows);
            return rows;
        });
    }

    // One equality lookup per stream, not an IN-list; the reason is in docs/environments.md.
    // claimBatch rechecks and locks, so this set only needs ids.
    private async findClaimCandidateIds(
        manager: EntityManager,
        limit: number,
        streams?: InboundStream[],
    ): Promise<string[]> {
        const params: unknown[] = [limit, STUCK_PROCESSING_THRESHOLD_MS];
        const pendingBranches =
            streams && streams.length > 0
                ? streams.map(stream => {
                      params.push(stream);
                      return `(SELECT id, eligible_at FROM integration_inbox_event
                          WHERE status = 'pending' AND stream = $${params.length} AND eligible_at <= now()
                          ORDER BY eligible_at ASC, id ASC LIMIT $1)`;
                  })
                : [
                      `(SELECT id, eligible_at FROM integration_inbox_event
                          WHERE status = 'pending' AND eligible_at <= now()
                          ORDER BY eligible_at ASC, id ASC LIMIT $1)`,
                  ];

        // eligible_at <= now() is the #96 backoff guard — see markFailed/the entity's own comment.
        let streamFilter = '';
        if (streams && streams.length > 0) {
            params.push(streams);
            streamFilter = `AND stream = ANY($${params.length})`;
        }
        const staleProcessingBranch = `(SELECT id, eligible_at FROM integration_inbox_event
            WHERE status = 'processing' AND eligible_at <= now()
              AND updated_at < now() - ($2 || ' milliseconds')::interval
              ${streamFilter}
            ORDER BY eligible_at ASC, id ASC LIMIT $1)`;

        // FIFO by the time a row became eligible, not by enqueue time — a backed-off retry queues
        // behind rows that arrived before it came due, so retries can't starve them (#146).
        const rows = await manager.query<Array<{ id: string }>>(
            `SELECT id FROM (${[...pendingBranches, staleProcessingBranch].join(' UNION ALL ')}) combined
             ORDER BY eligible_at ASC, id ASC LIMIT $1`,
            params,
        );
        return rows.map(row => row.id);
    }

    // The status and claim-token guards keep a stale worker's late outcome from overwriting a row
    // another worker settled or reclaimed.
    async markProcessed(
        id: number,
        outcome: InboxOutcome = 'applied',
        outcomeReason: string | null = null,
        claimToken?: string | null,
    ): Promise<void> {
        await settleProcessed(this.dataSource, id, outcome, outcomeReason, claimToken);
    }

    // Releases a deadline-stopped batch's unprocessed rows back to 'pending' (#149).
    async releaseClaims(ids: number[], claimToken?: string | null): Promise<void> {
        if (ids.length === 0) return;
        await this.dataSource.getRepository(IntegrationInboxEvent).update(
            {
                id: In(ids),
                status: 'processing',
                ...(claimToken ? { claimToken } : {}),
            },
            { status: 'pending', claimToken: null },
        );
    }

    async markFailed(
        id: number,
        error: Error,
        random: () => number = Math.random,
        onBudgetExhausted: BudgetExhaustedNoop | null = null,
        claimToken?: string | null,
    ): Promise<void> {
        await settleFailed(this.dataSource, id, error, random, onBudgetExhausted, claimToken);
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

    private isUniqueViolation(err: unknown): boolean {
        return (
            typeof err === 'object' &&
            err !== null &&
            'code' in err &&
            (err as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION
        );
    }
}
