import { Injectable } from '@nestjs/common';
import type { PaginatedList, RequestContext } from '@vendure/core';
import { Logger, TransactionalConnection } from '@vendure/core';
import { randomUUID } from 'crypto';
import { ctxQuery } from 'shared';
import { In } from 'typeorm';

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
export type ClaimedInboxEvent = IntegrationInboxEvent & { claimToken: string };

@Injectable()
export class IntegrationInboxService {
    constructor(private readonly connection: TransactionalConnection) {}

    // Dedup on (stream, sourceEventId), not version: versions can collide across distinct events.
    // Duplicates return the existing row, so the consumer can ack unconditionally.
    async enqueue(
        ctx: RequestContext,
        input: EnqueueInboxEventInput,
    ): Promise<IntegrationInboxEvent> {
        const repo = this.connection.getRepository(ctx, IntegrationInboxEvent);
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

    async enqueueRejected(ctx: RequestContext, message: RejectedInboxMessage): Promise<void> {
        await insertRejectedInboxRow(this.connection, ctx, message);
    }

    // Conditional UPDATE: only a still-failed row moves, so a double click or sweep race
    // cannot dismiss the same row twice.
    async dismissFailed(ctx: RequestContext, id: number, reason: string): Promise<boolean> {
        const result = await this.connection.getRepository(ctx, IntegrationInboxEvent).update(
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
    async claimBatch(
        ctx: RequestContext,
        limit = 20,
        streams?: InboundStream[],
    ): Promise<ClaimedInboxEvent[]> {
        return this.connection.withTransaction(ctx, async txCtx => {
            const repo = this.connection.getRepository(txCtx, IntegrationInboxEvent);
            const ids = await this.findClaimCandidateIds(txCtx, limit, streams);
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
            if (rows.length === 0) return [];
            const claimToken = randomUUID();
            for (const row of rows) {
                row.status = 'processing';
                row.claimToken = claimToken;
            }
            await repo.save(rows);
            return rows as ClaimedInboxEvent[];
        });
    }

    // One equality lookup per stream, not an IN-list; the reason is in docs/environments.md.
    // claimBatch rechecks and locks, so this set only needs ids.
    private async findClaimCandidateIds(
        ctx: RequestContext,
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
        const rows = await ctxQuery<Array<{ id: string }>>(
            this.connection,
            ctx,
            `SELECT id FROM (${[...pendingBranches, staleProcessingBranch].join(' UNION ALL ')}) combined
             ORDER BY eligible_at ASC, id ASC LIMIT $1`,
            params,
        );
        return rows.map(row => row.id);
    }

    // Worker path: the claim token restricts the write to the worker that still holds the claim,
    // so a stale worker's late outcome cannot overwrite a row another worker settled or reclaimed.
    async markProcessed(
        ctx: RequestContext,
        id: number,
        outcome: InboxOutcome,
        outcomeReason: string | null,
        claimToken: string,
    ): Promise<void> {
        await settleProcessed(this.connection, ctx, id, outcome, outcomeReason, claimToken);
    }

    // Releases a deadline-stopped batch's unprocessed rows back to 'pending' (#149).
    async releaseClaims(ctx: RequestContext, ids: number[], claimToken: string): Promise<void> {
        if (ids.length === 0) return;
        await this.connection
            .getRepository(ctx, IntegrationInboxEvent)
            .update(
                { id: In(ids), status: 'processing', claimToken },
                { status: 'pending', claimToken: null },
            );
    }

    async markFailed(
        ctx: RequestContext,
        id: number,
        error: Error,
        random: () => number,
        onBudgetExhausted: BudgetExhaustedNoop | null,
        claimToken: string,
    ): Promise<void> {
        await settleFailed(this.connection, ctx, id, error, random, onBudgetExhausted, claimToken);
    }

    // Non-worker path (ops and tests settling a row nobody claimed); guarded by status only.
    async markProcessedUnclaimed(
        ctx: RequestContext,
        id: number,
        outcome: InboxOutcome = 'applied',
        outcomeReason: string | null = null,
    ): Promise<void> {
        await settleProcessed(this.connection, ctx, id, outcome, outcomeReason);
    }

    async markFailedUnclaimed(
        ctx: RequestContext,
        id: number,
        error: Error,
        random: () => number = Math.random,
        onBudgetExhausted: BudgetExhaustedNoop | null = null,
    ): Promise<void> {
        await settleFailed(this.connection, ctx, id, error, random, onBudgetExhausted);
    }

    // Dashboard/ops read model (issue #76) — 'failed' rows are dead-lettered (markFailed above)
    // and need a human to notice and act; never fed back into claimBatch automatically.
    async findFailed(
        ctx: RequestContext,
        options?: FailedInboxEventListOptions,
    ): Promise<PaginatedList<IntegrationInboxEvent>> {
        const take = Math.min(options?.take ?? 20, FAILED_EVENTS_MAX_TAKE);
        const skip = options?.skip ?? 0;

        const [items, totalItems] = await this.connection
            .getRepository(ctx, IntegrationInboxEvent)
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
