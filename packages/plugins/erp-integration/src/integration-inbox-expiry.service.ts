import { Injectable } from '@nestjs/common';
import { RequestContextService, TransactionalConnection } from '@vendure/core';
import { ctxQuery, tryLockAggregate } from 'shared';

import {
    INBOX_DEDUP_HORIZON_DAYS,
    INBOX_EXPIRY_PASS_INTERVAL_MS,
    INBOX_EXPIRY_SLICE_SIZE,
} from './types';

const EXPIRY_LOCK_KEY = 'inbox-expiry';

// Ids grow with created_at, so one id-ordered slice is bounded and `reached_horizon` ends the pass.
// The guard keeps the newest processed version per entity (ties by id), emptied or not; compares like isVersionNewer.
export const EXPIRY_SLICE_SQL = `WITH slice AS (
       SELECT id, status, payload, created_at FROM integration_inbox_event
        WHERE id > $1::bigint ORDER BY id LIMIT $2
     ), del AS (
       DELETE FROM integration_inbox_event
        WHERE id IN (SELECT s.id FROM slice s JOIN integration_inbox_event t ON t.id = s.id
                      WHERE s.status = 'processed' AND s.payload = '{}'::jsonb
                        AND s.created_at < now() - make_interval(days => $3::int)
                        AND EXISTS (SELECT 1 FROM integration_inbox_event n
                                     WHERE n.stream = t.stream AND n.entity_id = t.entity_id
                                       AND n.id <> t.id AND n.status = 'processed'
                                       AND CASE WHEN n.version ~ '^[0-9]{1,30}$' AND t.version ~ '^[0-9]{1,30}$'
                                                THEN n.version::numeric > t.version::numeric
                                                       OR (n.version::numeric = t.version::numeric AND n.id > t.id)
                                                ELSE n.version COLLATE "C" > t.version COLLATE "C"
                                                       OR (n.version = t.version AND n.id > t.id) END))
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
