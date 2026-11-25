import { Injectable } from '@nestjs/common';
import { RequestContextService, TransactionalConnection } from '@vendure/core';
import { ctxQuery, tryLockAggregate } from 'shared';

import {
    INBOX_DEDUP_HORIZON_DAYS,
    INBOX_EXPIRY_PASS_INTERVAL_MS,
    INBOX_EXPIRY_SLICE_SIZE,
} from './types';

const EXPIRY_LOCK_KEY = 'inbox-expiry';

// Keeps the newest version per entity; SQL order matches isVersionNewer only when one entity's versions are
// all numeric (up to 30 digits) or all strings. Id-ordered slices end at `reached_horizon`.
export const EXPIRY_SLICE_SQL = `WITH slice AS (
       SELECT id, stream, entity_id, status, payload, created_at FROM integration_inbox_event
        WHERE id > $1::bigint ORDER BY id LIMIT $2
     ), cand AS (
       SELECT id, stream, entity_id FROM slice
        WHERE status = 'processed' AND payload = '{}'::jsonb
          AND created_at < now() - make_interval(days => $3::int)
     ), newest AS MATERIALIZED (
       SELECT k.stream, k.entity_id, x.id AS keep_id
         FROM (SELECT DISTINCT stream, entity_id FROM cand) k
         CROSS JOIN LATERAL (
           SELECT n.id FROM integration_inbox_event n
            WHERE n.stream = k.stream AND n.entity_id = k.entity_id AND n.status = 'processed'
            ORDER BY CASE WHEN n.version ~ '^[0-9]{1,30}$' THEN n.version::numeric END DESC NULLS LAST,
                     n.version COLLATE "C" DESC, n.id DESC LIMIT 1) x
     ), del AS (
       DELETE FROM integration_inbox_event
        WHERE id IN (SELECT c.id FROM cand c JOIN newest w ON w.stream = c.stream AND w.entity_id = c.entity_id
                      WHERE c.id <> w.keep_id)
       RETURNING id
     )
     SELECT (SELECT count(*) FROM del)::int AS deleted,
            (SELECT max(id) FROM slice) AS last_id,
            (SELECT count(*) FROM slice)::int AS scanned,
            COALESCE((SELECT bool_or(created_at >= now() - make_interval(days => $3::int)) FROM slice), true) AS reached_horizon`;

export interface ExpirySliceResult {
    deleted: number;
    finished: boolean;
    outcome: 'swept' | 'skipped' | 'timeout';
}

interface ExpirySliceRow {
    deleted: number;
    last_id: string | null;
    scanned: number;
    reached_horizon: boolean;
}

// Deletes tombstoned processed rows past the dedup horizon (docs/integration-health.md). The newest
// processed version per entity is never deleted, so a redelivered old event is still caught as superseded.
@Injectable()
export class IntegrationInboxExpiryService {
    private cursor = '0';
    // A finished pass re-reads every old row, so the next one waits for the interval.
    private nextPassAt = 0;

    constructor(
        private readonly connection: TransactionalConnection,
        private readonly requestContextService: RequestContextService,
    ) {}

    async deleteExpiredTombstones(statementTimeoutMs: number): Promise<ExpirySliceResult> {
        if (Date.now() < this.nextPassAt) return { deleted: 0, finished: true, outcome: 'skipped' };
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        try {
            return await this.connection.withTransaction(ctx, async txCtx => {
                if (!(await tryLockAggregate(this.connection, txCtx, EXPIRY_LOCK_KEY)))
                    return { deleted: 0, finished: true, outcome: 'skipped' as const };
                await ctxQuery<unknown>(
                    this.connection,
                    txCtx,
                    `select set_config('statement_timeout', $1, true)`,
                    [String(statementTimeoutMs)],
                );
                const [row] = await ctxQuery<ExpirySliceRow[]>(
                    this.connection,
                    txCtx,
                    EXPIRY_SLICE_SQL,
                    [this.cursor, INBOX_EXPIRY_SLICE_SIZE, INBOX_DEDUP_HORIZON_DAYS],
                );
                const finished = row.scanned < INBOX_EXPIRY_SLICE_SIZE || row.reached_horizon;
                if (finished) this.nextPassAt = Date.now() + INBOX_EXPIRY_PASS_INTERVAL_MS;
                this.cursor = finished || row.last_id === null ? '0' : row.last_id;
                return { deleted: row.deleted, finished, outcome: 'swept' as const };
            });
        } catch (error) {
            const e = error as { code?: string; driverError?: { code?: string } };
            if (e?.code !== '57014' && e?.driverError?.code !== '57014') throw error;
            return { deleted: 0, finished: true, outcome: 'timeout' };
        }
    }
}
