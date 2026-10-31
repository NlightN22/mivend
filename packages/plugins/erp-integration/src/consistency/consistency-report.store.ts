import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

import { REPORT_UNAVAILABLE_ISSUE_ID, REPORT_UNAVAILABLE_TYPE } from './consistency-types';
import type { ConsistencyHealth, ConsistencyIssue, ConsistencySummary } from './consistency-types';

export interface SourceStateWrite {
    source: string;
    health: ConsistencyHealth;
    detail: string;
    summary: ConsistencySummary | null;
    lastFinishedAt: string | null;
    watermark: string | null;
    succeeded: boolean;
}

export interface StoredSourceState {
    health: ConsistencyHealth;
    lastFinishedAt: Date | null;
    watermark: Date | null;
}

// Writes are single idempotent statements: the last_detected_at guard makes a late or repeated page
// harmless, so no poll-level lock is held across the provider calls (docs/concurrency.md rule b).
@Injectable()
export class ConsistencyReportStore {
    constructor(private readonly connection: TransactionalConnection) {}

    // Callers pass a page; the same id may appear twice across pages, never inside one statement.
    async upsertIssues(
        ctx: RequestContext,
        source: string,
        issues: ConsistencyIssue[],
    ): Promise<void> {
        const unique = new Map<string, ConsistencyIssue>();
        for (const issue of issues) {
            const seen = unique.get(issue.providerIssueId);
            if (!seen || Date.parse(issue.lastDetectedAt) >= Date.parse(seen.lastDetectedAt)) {
                unique.set(issue.providerIssueId, issue);
            }
        }
        if (unique.size === 0) return;
        const rows = [...unique.values()].sort((a, b) =>
            a.providerIssueId.localeCompare(b.providerIssueId),
        );
        await ctxQuery(
            this.connection,
            ctx,
            `INSERT INTO consistency_report (uuid, source, provider_issue_id, type, severity, entity_type,
                entity_id, scope, expected, actual, details, replayable, occurrences, first_detected_at,
                last_detected_at, resolved_at, status)
             SELECT gen_random_uuid(), $1, r."providerIssueId", r.type, r.severity, r."entityType", r."entityId",
                r.scope, r.expected, r.actual, r.details, r.replayable, r.occurrences, r."firstDetectedAt",
                r."lastDetectedAt", r."resolvedAt", r.status
               FROM jsonb_to_recordset($2::jsonb) AS r("providerIssueId" text, type text, severity text,
                "entityType" text, "entityId" text, scope jsonb, expected jsonb, actual jsonb, details text,
                replayable boolean, occurrences int, "firstDetectedAt" timestamptz,
                "lastDetectedAt" timestamptz, "resolvedAt" timestamptz, status text)
             ON CONFLICT (source, provider_issue_id) DO UPDATE SET
                type = EXCLUDED.type, severity = EXCLUDED.severity, entity_type = EXCLUDED.entity_type,
                entity_id = EXCLUDED.entity_id, scope = EXCLUDED.scope, expected = EXCLUDED.expected,
                actual = EXCLUDED.actual, details = EXCLUDED.details, replayable = EXCLUDED.replayable,
                occurrences = EXCLUDED.occurrences, first_detected_at = EXCLUDED.first_detected_at,
                last_detected_at = EXCLUDED.last_detected_at, resolved_at = EXCLUDED.resolved_at,
                status = EXCLUDED.status, "updatedAt" = now()
              WHERE consistency_report.last_detected_at <= EXCLUDED.last_detected_at`,
            [source, JSON.stringify(rows)],
        );
    }

    async markUnavailable(
        ctx: RequestContext,
        source: string,
        health: ConsistencyHealth,
        detail: string,
    ): Promise<void> {
        const severity = health === 'no-check-yet' ? 'warning' : 'critical';
        await ctxQuery(
            this.connection,
            ctx,
            `INSERT INTO consistency_report (uuid, source, provider_issue_id, type, severity, entity_type,
                entity_id, details, first_detected_at, last_detected_at, status)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, 'source', $1, $5, now(), now(), 'open')
             ON CONFLICT (source, provider_issue_id) DO UPDATE SET
                occurrences = CASE WHEN consistency_report.status = 'resolved'
                                   THEN consistency_report.occurrences + 1 ELSE consistency_report.occurrences END,
                first_detected_at = CASE WHEN consistency_report.status = 'resolved'
                                         THEN now() ELSE consistency_report.first_detected_at END,
                severity = EXCLUDED.severity, details = EXCLUDED.details, last_detected_at = now(),
                resolved_at = NULL, status = 'open', "updatedAt" = now()`,
            [source, REPORT_UNAVAILABLE_ISSUE_ID, REPORT_UNAVAILABLE_TYPE, severity, detail],
        );
    }

    async resolveUnavailable(ctx: RequestContext, source: string): Promise<void> {
        await ctxQuery(
            this.connection,
            ctx,
            `UPDATE consistency_report SET status = 'resolved', resolved_at = now(), "updatedAt" = now()
              WHERE source = $1 AND provider_issue_id = $2 AND status = 'open'`,
            [source, REPORT_UNAVAILABLE_ISSUE_ID],
        );
    }

    async getState(ctx: RequestContext, source: string): Promise<StoredSourceState | null> {
        const rows = await ctxQuery<
            Array<{
                health: ConsistencyHealth;
                last_finished_at: Date | null;
                watermark: Date | null;
            }>
        >(
            this.connection,
            ctx,
            `SELECT health, last_finished_at, watermark FROM consistency_source_state WHERE source = $1`,
            [source],
        );
        const row = rows[0];
        if (!row) return null;
        return {
            health: row.health,
            lastFinishedAt: row.last_finished_at,
            watermark: row.watermark,
        };
    }

    async writeState(ctx: RequestContext, state: SourceStateWrite): Promise<void> {
        await ctxQuery(
            this.connection,
            ctx,
            `INSERT INTO consistency_source_state (uuid, source, health, health_detail, summary,
                last_finished_at, watermark, last_polled_at, last_success_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, $5::timestamptz, $6::timestamptz, now(),
                CASE WHEN $7::boolean THEN now() END)
             ON CONFLICT (source) DO UPDATE SET
                health = EXCLUDED.health, health_detail = EXCLUDED.health_detail,
                summary = COALESCE(EXCLUDED.summary, consistency_source_state.summary),
                last_finished_at = GREATEST(consistency_source_state.last_finished_at, EXCLUDED.last_finished_at),
                watermark = GREATEST(consistency_source_state.watermark, EXCLUDED.watermark),
                last_polled_at = now(),
                last_success_at = COALESCE(EXCLUDED.last_success_at, consistency_source_state.last_success_at),
                "updatedAt" = now()`,
            [
                state.source,
                state.health,
                state.detail,
                state.summary ? JSON.stringify(state.summary) : null,
                state.lastFinishedAt,
                state.watermark,
                state.succeeded,
            ],
        );
    }

    async deleteResolvedOlderThan(ctx: RequestContext, days: number): Promise<number> {
        const rows = await ctxQuery<Array<{ n: number }>>(
            this.connection,
            ctx,
            `WITH d AS (DELETE FROM consistency_report
                         WHERE status = 'resolved' AND resolved_at < now() - make_interval(days => $1::int)
                         RETURNING 1)
             SELECT count(*)::int AS n FROM d`,
            [days],
        );
        return rows[0].n;
    }
}
