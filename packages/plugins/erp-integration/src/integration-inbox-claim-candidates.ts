import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

import type { InboundStream } from './types';

// One quarter of every batch is reserved for due parked rows so they do not wait for the pending backlog.
export const PARKED_SHARE_DENOMINATOR = 4;

const UNLISTED_LEVEL = 2147483647;

export function parkedReserve(limit: number): number {
    return limit > 1 ? Math.ceil(limit / PARKED_SHARE_DENOMINATOR) : 0;
}

// Pending/stale take the batch minus the parked rows that fit the reserve; spare slots flow either way.
export function mergeCandidates(pending: string[], parked: string[], limit: number): string[] {
    const pendingTake = Math.min(
        pending.length,
        limit - Math.min(parked.length, parkedReserve(limit)),
    );
    return [...pending.slice(0, pendingTake), ...parked.slice(0, limit - pendingTake)];
}

const LEVEL_EXPR = `COALESCE((SELECT l.level FROM unnest($2::text[], $3::int[]) AS l(stream, level)
                        WHERE l.stream = integration_inbox_event.stream), ${UNLISTED_LEVEL})`;

type IdRows = Array<{ id: string }>;

// Params: $1 limit, $2 level names, $3 level values, $4 stale ms, $5.. per-stream values.
// One equality lookup per stream, not an IN-list (docs/environments.md), so every branch stays index-friendly.
function statusBranches(
    status: string,
    streamValues: string[],
    unlisted: boolean,
    extra = '',
): string {
    const branches = streamValues.map(
        (_, i) => `(SELECT id, eligible_at, ${LEVEL_EXPR} AS lvl FROM integration_inbox_event
            WHERE status = '${status}' AND stream = $${5 + i} AND eligible_at <= now() ${extra}
            ORDER BY eligible_at ASC, id ASC LIMIT $1)`,
    );
    if (unlisted) {
        branches.push(`(SELECT id, eligible_at, ${UNLISTED_LEVEL} AS lvl FROM integration_inbox_event
            WHERE status = '${status}' AND stream <> ALL($2::text[]) AND eligible_at <= now() ${extra}
            ORDER BY eligible_at ASC, id ASC LIMIT $1)`);
    }
    return branches.join(' UNION ALL ');
}

// Streams absent from the level table sort after every listed level; an empty table keeps FIFO.
export async function findClaimCandidateIds(
    connection: TransactionalConnection,
    ctx: RequestContext,
    limit: number,
    staleMs: number,
    levels: ReadonlyMap<string, number>,
    streams?: InboundStream[],
): Promise<string[]> {
    const filtered = streams !== undefined && streams.length > 0;
    const names = [...levels.keys()];
    const streamValues: string[] = filtered ? streams : names;
    const unlisted = !filtered;
    const base: unknown[] = [limit, names, [...levels.values()], staleMs, ...streamValues];
    const order = 'ORDER BY lvl ASC, eligible_at ASC, id ASC LIMIT $1';

    // eligible_at <= now() is the #96 backoff guard — see markFailed/the entity's own comment.
    const streamFilter = filtered ? `AND stream = ANY($${base.length + 1}::text[])` : '';
    const staleParams = filtered ? [...base, streams] : base;
    const staleBranch = `(SELECT id, eligible_at, ${LEVEL_EXPR} AS lvl FROM integration_inbox_event
        WHERE status = 'processing' AND eligible_at <= now()
          AND updated_at < now() - ($4 || ' milliseconds')::interval ${streamFilter}
        ORDER BY eligible_at ASC, id ASC LIMIT $1)`;
    const pendingSql = `${statusBranches('pending', streamValues, unlisted)} UNION ALL ${staleBranch}`;
    const pending = await ctxQuery<IdRows>(
        connection,
        ctx,
        `SELECT id FROM (${pendingSql}) combined ${order}`,
        staleParams,
    );

    // Postgres rejects an unreferenced bound parameter, so the parked branches reference $4 harmlessly.
    const parkedSql = statusBranches(
        'dependency_missing',
        streamValues,
        unlisted,
        'AND $4::bigint >= 0',
    );
    const parked = await ctxQuery<IdRows>(
        connection,
        ctx,
        `SELECT id FROM (${parkedSql}) combined ${order}`,
        base,
    );
    return mergeCandidates(
        pending.map(r => r.id),
        parked.map(r => r.id),
        limit,
    );
}
