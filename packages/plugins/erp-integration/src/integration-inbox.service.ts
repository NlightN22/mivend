import { Injectable } from '@nestjs/common';
import type { PaginatedList } from '@vendure/core';
import { Logger } from '@vendure/core';
import { DataSource, EntityManager, In } from 'typeorm';

const loggerCtx = 'IntegrationInboxService';

import { IntegrationInboxEvent } from './entities/integration-inbox-event.entity';
import { replayDidNotResolve } from './inbox-replay-lifecycle';
import { NonRetryableInboundError } from './non-retryable-inbound-error';
import { computeRetryBackoffMs } from './retry-policy';
import { INBOX_RETRY_WALL_CLOCK_BUDGET_MS } from './types';
import type { InboundStream } from './types';
import { insertRejectedInboxRow } from './integration-inbox-rejected';
import type { RejectedInboxMessage } from './integration-inbox-rejected';

const POSTGRES_UNIQUE_VIOLATION = '23505';

// A row stuck in 'processing' this long was abandoned by a crashed/killed worker — reclaim it on
// the next sweep. Mirrors plugin-acquiring's InboxService (STUCK_PROCESSING_THRESHOLD_MS).
const STUCK_PROCESSING_THRESHOLD_MS = 5 * 60 * 1000;

const OPEN_STATUSES = ['pending', 'processing'];
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
            for (const row of rows) {
                row.status = 'processing';
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

    // The status guard keeps a stale worker's late outcome from overwriting a row another worker settled.
    // One statement: marks the row processed and closes any replay_requested row of the same entity
    // that was requested before this event arrived (any recorded outcome closes it, noop included).
    async markProcessed(
        id: number,
        outcome: 'applied' | 'superseded' | 'noop' = 'applied',
        outcomeReason: string | null = null,
    ): Promise<void> {
        await this.dataSource.query(
            `WITH done AS (
                UPDATE integration_inbox_event
                   SET status = 'processed', processed_at = now(), outcome = $2, outcome_reason = $3
                 WHERE id = $1 AND status IN ('pending', 'processing')
             RETURNING stream, entity_id, created_at)
             UPDATE integration_inbox_event r SET status = 'resolved'
               FROM done
              WHERE r.stream = done.stream AND r.entity_id = done.entity_id
                AND r.status = 'replay_requested' AND r.replay_requested_at <= done.created_at`,
            [id, outcome, outcomeReason],
        );
    }

    // Releases a deadline-stopped batch's unprocessed rows back to 'pending' (#149).
    async releaseClaims(ids: number[]): Promise<void> {
        if (ids.length === 0) return;
        await this.dataSource
            .getRepository(IntegrationInboxEvent)
            .update({ id: In(ids), status: 'processing' }, { status: 'pending' });
    }

    // Failures retry with backoff and dead-letter only after 24h from the first failure;
    // NonRetryableInboundError fails at once. onBudgetExhausted can turn a kind into a noop instead.
    async markFailed(
        id: number,
        error: Error,
        random: () => number = Math.random,
        onBudgetExhausted: { outcome: 'noop'; reason: string } | null = null,
    ): Promise<void> {
        const repo = this.dataSource.getRepository(IntegrationInboxEvent);
        const open = { id, status: In(OPEN_STATUSES) };
        const bumped = await this.dataSource.transaction(async em => {
            const row = await em
                .getRepository(IntegrationInboxEvent)
                .createQueryBuilder('e')
                .setLock('pessimistic_write')
                .where('e.id = :id AND e.status IN (:...open)', { id, open: OPEN_STATUSES })
                .getOne();
            if (!row) return null;
            const next = {
                attempts: row.attempts + 1,
                firstFailedAt: row.firstFailedAt ?? new Date(),
            };
            await em.update(IntegrationInboxEvent, { id }, next);
            return next;
        });
        if (!bumped) {
            Logger.warn(`markFailed skipped: inbox row ${id} is already settled`, loggerCtx);
            return;
        }
        const { attempts, firstFailedAt } = bumped;
        const retriable = !(error instanceof NonRetryableInboundError);
        if (!retriable || Date.now() - firstFailedAt.getTime() > INBOX_RETRY_WALL_CLOCK_BUDGET_MS) {
            if (retriable && onBudgetExhausted) {
                await repo.update(open, { lastError: error.message });
                await this.markProcessed(id, onBudgetExhausted.outcome, onBudgetExhausted.reason);
                return;
            }
            await repo.update(open, {
                lastError: error.message,
                status: 'failed',
                nextRetryAt: null,
            });
            await this.dataSource.query(
                `UPDATE integration_inbox_event r
                    SET status = 'failed', replay_requested_at = NULL, last_error = $2
                   FROM integration_inbox_event n
                  WHERE n.id = $1 AND r.stream = n.stream AND r.entity_id = n.entity_id
                    AND r.status = 'replay_requested' AND r.replay_requested_at <= n.created_at`,
                [id, replayDidNotResolve(`the replayed event failed: ${error.message}`)],
            );
            return;
        }
        const nextRetryAt = new Date(Date.now() + computeRetryBackoffMs(attempts, random));
        await repo.update(open, {
            lastError: error.message,
            status: 'pending',
            nextRetryAt,
            // Keeps eligibleAt (claimBatch's sole ordering/filter column, #147) equal to
            // nextRetryAt for the duration of the backoff — see the entity's own comment.
            eligibleAt: nextRetryAt,
        });
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
