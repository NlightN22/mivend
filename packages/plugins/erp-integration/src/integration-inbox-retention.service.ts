import { Injectable } from '@nestjs/common';
import { Logger, RequestContextService, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

import {
    RETENTION_MIN_SLICE_SIZE,
    RETENTION_SLICE_SIZE,
    RETENTION_SLICE_SQL,
    planRetentionSlice,
    type RetentionCursor,
    type RetentionRow,
} from './integration-inbox-retention-slice';
import { INBOX_RETENTION_STATEMENT_TIMEOUT_MS, loggerCtx } from './types';

const RETENTION_LOCK_KEY = 'inbox-retention';
const QUERY_CANCELED = '57014';

export interface RetentionSliceResult {
    tombstoned: number;
    // True when the pass over the index is complete, or this call did nothing (skipped/timeout).
    finished: boolean;
    outcome: 'swept' | 'skipped' | 'timeout';
}

function isStatementTimeout(error: unknown): boolean {
    const e = error as { code?: string; driverError?: { code?: string } };
    return e?.code === QUERY_CANCELED || e?.driverError?.code === QUERY_CANCELED;
}

// Retention of processed inbox rows, split from IntegrationInboxService (claim/retry code).
@Injectable()
export class IntegrationInboxRetentionService {
    // Per-process resume point; losing it on restart only restarts the pass (the work is idempotent).
    private cursor: RetentionCursor | null = null;
    // Halved on a statement timeout so a slow slice shrinks until it fits, doubled back after a success.
    private sliceSize = RETENTION_SLICE_SIZE;

    constructor(
        private readonly connection: TransactionalConnection,
        private readonly requestContextService: RequestContextService,
    ) {}

    // Older duplicates keep their row but get payload={}: the row is the enqueue dedup key.
    // Deleting it would let a Kafka redelivery pass dedup as new and reapply stale data.
    // One call handles one bounded index slice; the DB cancels it past the statement timeout.
    async purgeSupersededProcessedRows(
        statementTimeoutMs: number = INBOX_RETENTION_STATEMENT_TIMEOUT_MS,
    ): Promise<RetentionSliceResult> {
        try {
            return await this.sweepSlice(statementTimeoutMs);
        } catch (error) {
            if (!isStatementTimeout(error)) throw error;
            this.sliceSize = Math.max(RETENTION_MIN_SLICE_SIZE, Math.floor(this.sliceSize / 2));
            Logger.warn(
                `Integration inbox retention slice hit the ${statementTimeoutMs} ms statement timeout; retrying with ${this.sliceSize} rows`,
                loggerCtx,
            );
            return { tombstoned: 0, finished: true, outcome: 'timeout' };
        }
    }

    private async sweepSlice(statementTimeoutMs: number): Promise<RetentionSliceResult> {
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        return this.connection.withTransaction(ctx, async txCtx => {
            // A try-lock skips the call when another sweep is running, so sweeps never overlap.
            const [lock] = await ctxQuery<Array<{ locked: boolean }>>(
                this.connection,
                txCtx,
                'select pg_try_advisory_xact_lock(hashtextextended($1, 0)) as locked',
                [RETENTION_LOCK_KEY],
            );
            if (!lock.locked) return { tombstoned: 0, finished: true, outcome: 'skipped' };

            await ctxQuery<unknown>(
                this.connection,
                txCtx,
                `select set_config('statement_timeout', $1, true)`,
                [String(statementTimeoutMs)],
            );
            const rows = await ctxQuery<RetentionRow[]>(
                this.connection,
                txCtx,
                RETENTION_SLICE_SQL,
                [this.cursor?.stream ?? null, this.cursor?.entityId ?? null, this.sliceSize],
            );
            const plan = planRetentionSlice(rows, this.sliceSize);
            if (plan.tombstoneIds.length > 0) {
                await ctxQuery<unknown>(
                    this.connection,
                    txCtx,
                    `UPDATE integration_inbox_event SET payload = '{}'::jsonb WHERE id = ANY($1::bigint[])`,
                    [plan.tombstoneIds],
                );
            }
            this.cursor = plan.nextCursor;
            this.sliceSize = Math.min(RETENTION_SLICE_SIZE, this.sliceSize * 2);
            return {
                tombstoned: plan.tombstoneIds.length,
                finished: plan.finished,
                outcome: 'swept',
            };
        });
    }
}
