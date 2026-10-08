import { Injectable } from '@nestjs/common';
import type { PaginatedList } from '@vendure/core';
import { Logger } from '@vendure/core';
import { DataSource, EntityManager, In } from 'typeorm';

const loggerCtx = 'IntegrationInboxService';

import { IntegrationInboxEvent } from './entities/integration-inbox-event.entity';
import { replayDidNotResolve } from './inbox-replay-lifecycle';
import { computeRetryBackoffMs } from './retry-policy';
import { INBOX_RETRY_WALL_CLOCK_BUDGET_MS } from './types';
import type { InboundStream } from './types';
import { insertRejectedInboxRow } from './integration-inbox-rejected';
import type { RejectedInboxMessage } from './integration-inbox-rejected';
import { isVersionNewer } from './version-compare';

const POSTGRES_UNIQUE_VIOLATION = '23505';

// A row stuck in 'processing' this long was abandoned by a crashed/killed worker — reclaim it on
// the next sweep. Mirrors plugin-acquiring's InboxService (STUCK_PROCESSING_THRESHOLD_MS).
const STUCK_PROCESSING_THRESHOLD_MS = 5 * 60 * 1000;

const FAILED_EVENTS_MAX_TAKE = 100;

// Retention (#147): each purge tick only looks at this many (stream, entityId) groups with more
// than one `processed` row, so a huge backlog of duplicates can't turn one purge tick into a
// single unbounded DELETE — the scheduled task just takes more ticks instead.
const PURGE_SUPERSEDED_GROUP_BATCH_SIZE = 200;

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

    // #148: one branch per stream for the `pending` half (each a plain equality lookup, not an
    // IN-list — see docs/environments.md's #148 note for why) plus one for stale-`processing`.
    // Only ids: claimBatch's own recheck+lock does the real work against this small set.
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
                 WHERE id = $1
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

    // Every failure retries with backoff (nextRetryAt) and dead-letters only once 24h have passed
    // since its first failure — one policy for all streams and error kinds (#145).
    async markFailed(id: number, error: Error, random: () => number = Math.random): Promise<void> {
        const repo = this.dataSource.getRepository(IntegrationInboxEvent);
        const row = await repo.findOneOrFail({ where: { id } });
        const attempts = row.attempts + 1;
        const firstFailedAt = row.firstFailedAt ?? new Date();
        if (Date.now() - firstFailedAt.getTime() > INBOX_RETRY_WALL_CLOCK_BUDGET_MS) {
            await repo.update(
                { id },
                { attempts, lastError: error.message, status: 'failed', nextRetryAt: null },
            );
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
        await repo.update(
            { id },
            {
                attempts,
                firstFailedAt,
                lastError: error.message,
                status: 'pending',
                nextRetryAt,
                // Keeps eligibleAt (claimBatch's sole ordering/filter column, #147) equal to
                // nextRetryAt for the duration of the backoff — see the entity's own comment.
                eligibleAt: nextRetryAt,
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

    // Retention (#147): only the latest processed version per (stream, entityId) is read
    // (isSupersededByNewerVersion) — tombstones (payload={}) every older duplicate's payload but
    // keeps the row, since it's the enqueue dedup key and deleting it would let a real Kafka
    // redelivery pass dedup as new and reapply stale data (audit HIGH finding).
    async purgeSupersededProcessedRows(): Promise<number> {
        const repo = this.dataSource.getRepository(IntegrationInboxEvent);
        const tombstone = {};

        const groups = await repo
            .createQueryBuilder('event')
            .select('event.stream', 'stream')
            .addSelect('event.entity_id', 'entityId')
            .where('event.status = :status', { status: 'processed' })
            .andWhere(`event.payload <> '{}'::jsonb`)
            .groupBy('event.stream')
            .addGroupBy('event.entity_id')
            .having('COUNT(*) > 1')
            .limit(PURGE_SUPERSEDED_GROUP_BATCH_SIZE)
            .getRawMany<{ stream: InboundStream; entityId: string }>();

        if (groups.length === 0) return 0;

        let tombstoned = 0;
        for (const group of groups) {
            const rows = await repo
                .createQueryBuilder('event')
                .select(['event.id', 'event.version'])
                .where('event.stream = :stream', { stream: group.stream })
                .andWhere('event.entityId = :entityId', { entityId: group.entityId })
                .andWhere('event.status = :status', { status: 'processed' })
                .andWhere(`event.payload <> '{}'::jsonb`)
                .getMany();
            // isVersionNewer, not a SQL/lexicographic MAX(version) — version is not guaranteed
            // fixed-width (see the entity's own column comment), same rule as
            // IntegrationInboxProcessorService.isSupersededByNewerVersion.
            let newest = rows[0];
            for (const row of rows.slice(1)) {
                if (isVersionNewer(row.version, newest.version)) newest = row;
            }
            const idsToTombstone = rows.filter(row => row.id !== newest.id).map(row => row.id);
            if (idsToTombstone.length === 0) continue;
            await repo.update(idsToTombstone, { payload: tombstone });
            tombstoned += idsToTombstone.length;
        }
        return tombstoned;
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
