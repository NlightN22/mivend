import { Injectable, Logger } from '@nestjs/common';
import { RequestContextService, TransactionalConnection } from '@vendure/core';
import { ctxQuery, tryLockAggregate } from 'shared';

import {
    INBOX_DEDUP_HORIZON_DAYS,
    INBOX_EXPIRY_PASS_INTERVAL_MS,
    INBOX_EXPIRY_SLICE_SIZE,
    INBOX_EXPIRY_LAG_WARN_MS,
    INBOX_FLOOR_RETENTION_DAYS,
    loggerCtx,
} from './types';
import { VERSION_GUARDED_STREAMS } from './reconciled-streams';

const EXPIRY_LOCK_KEY = 'inbox-expiry';

// Keeps the newest version per entity, except version-guarded streams past the floor window (#414).
// SQL order matches isVersionNewer only for all-numeric (<=30 digits) or all-string versions; slices end at `reached_horizon`.
// A deleted order-changed / order-state floor row first hands its version to the order (OrderEventVersionService).
export const EXPIRY_SLICE_SQL = `WITH slice AS (
       SELECT id, stream, entity_id, version, status, payload, created_at FROM integration_inbox_event
        WHERE id > $1::bigint ORDER BY id LIMIT $2
     ), cand AS (
       SELECT id, stream, entity_id, version, created_at FROM slice
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
     ), floor_rows AS (
       SELECT c.stream, c.entity_id, c.version FROM cand c JOIN newest w ON w.stream = c.stream AND w.entity_id = c.entity_id AND w.keep_id = c.id
        WHERE c.stream IN ('order-changed', 'order-state')
          AND c.created_at < now() - make_interval(days => $5::int)
     ), stamp AS (
       UPDATE "order" o SET
         "customFieldsErpchangedversion" = CASE
           WHEN f.changed IS NOT NULL AND (o."customFieldsErpchangedversion" IS NULL
                OR o."customFieldsErpchangedversion" COLLATE "C" < f.changed COLLATE "C")
           THEN f.changed ELSE o."customFieldsErpchangedversion" END,
         "customFieldsErpstateversion" = CASE
           WHEN f.state IS NOT NULL AND (o."customFieldsErpstateversion" IS NULL
                OR o."customFieldsErpstateversion" COLLATE "C" < f.state COLLATE "C")
           THEN f.state ELSE o."customFieldsErpstateversion" END
         FROM (SELECT entity_id,
                      max(version) FILTER (WHERE stream = 'order-changed') AS changed,
                      max(version) FILTER (WHERE stream = 'order-state') AS state
                 FROM floor_rows GROUP BY entity_id) f
        WHERE o."customFieldsErporderid" = f.entity_id
       RETURNING o.id
     ), del AS (
       DELETE FROM integration_inbox_event
        WHERE id IN (SELECT c.id FROM cand c JOIN newest w ON w.stream = c.stream AND w.entity_id = c.entity_id
                      WHERE c.id <> w.keep_id
                         OR (c.stream = ANY($4::text[]) AND c.created_at < now() - make_interval(days => $5::int)))
       RETURNING id
     )
     SELECT (SELECT count(*) FROM del)::int AS deleted,
            (SELECT count(*) FROM stamp)::int AS stamped,
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
// processed version per entity stays until the floor window (state streams forever), so a redelivered old event is still caught as superseded.
@Injectable()
export class IntegrationInboxExpiryService {
    private cursor = '0';
    // A finished pass re-reads every old row, so the next one waits for the interval.
    private nextPassAt = 0;
    private passStartedAt = 0;
    private passDeleted = 0;

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
                    [
                        this.cursor,
                        INBOX_EXPIRY_SLICE_SIZE,
                        INBOX_DEDUP_HORIZON_DAYS,
                        VERSION_GUARDED_STREAMS,
                        INBOX_FLOOR_RETENTION_DAYS,
                    ],
                );
                const finished = row.scanned < INBOX_EXPIRY_SLICE_SIZE || row.reached_horizon;
                this.passStartedAt ||= Date.now();
                this.passDeleted += row.deleted;
                if (finished) this.reportPass();
                this.cursor = finished || row.last_id === null ? '0' : row.last_id;
                return { deleted: row.deleted, finished, outcome: 'swept' as const };
            });
        } catch (error) {
            const e = error as { code?: string; driverError?: { code?: string } };
            if (e?.code !== '57014' && e?.driverError?.code !== '57014') throw error;
            Logger.warn(
                `Inbox expiry slice timed out; the pass resumes from the same cursor`,
                loggerCtx,
            );
            return { deleted: 0, finished: true, outcome: 'timeout' };
        }
    }

    // A pass that takes longer than the lag budget means cleanup is not keeping up with arrivals.
    private reportPass(): void {
        const durationMs = Date.now() - this.passStartedAt;
        const message = `Inbox expiry pass finished: deleted ${this.passDeleted} rows in ${Math.round(durationMs / 1000)} s`;
        if (durationMs > INBOX_EXPIRY_LAG_WARN_MS)
            Logger.warn(`${message}, over the lag budget`, loggerCtx);
        else Logger.log(message, loggerCtx);
        this.passStartedAt = 0;
        this.passDeleted = 0;
        this.nextPassAt = Date.now() + INBOX_EXPIRY_PASS_INTERVAL_MS;
    }
}
