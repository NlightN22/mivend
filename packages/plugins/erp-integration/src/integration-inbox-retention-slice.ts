import { isVersionNewer } from './version-compare';

export const RETENTION_SLICE_SIZE = 2000;
export const RETENTION_MIN_SLICE_SIZE = 100;

export interface RetentionCursor {
    stream: string;
    entityId: string;
}

export interface RetentionRow {
    id: string;
    stream: string;
    entity_id: string;
    version: string;
}

export interface RetentionSlicePlan {
    tombstoneIds: string[];
    nextCursor: RetentionCursor | null;
    finished: boolean;
}

// Keyset range over the partial index (stream, entity_id): bounded rows per call, resumable by cursor.
export const RETENTION_SLICE_SQL = `SELECT id, stream, entity_id, version FROM integration_inbox_event
     WHERE status = 'processed' AND payload <> '{}'::jsonb
       AND ($1::varchar IS NULL OR (stream, entity_id) > ($1::varchar, $2::varchar))
     ORDER BY stream, entity_id LIMIT $3`;

const keyOf = (row: RetentionRow): string => `${row.stream}\u0000${row.entity_id}`;

export function planRetentionSlice(
    rows: RetentionRow[],
    limit: number = RETENTION_SLICE_SIZE,
): RetentionSlicePlan {
    if (rows.length === 0) return { tombstoneIds: [], nextCursor: null, finished: true };
    const finished = rows.length < limit;
    let usable = rows;
    // A full slice may cut the last group in half; leave it for the next slice (unless it is the whole slice).
    if (!finished) {
        const lastKey = keyOf(rows[rows.length - 1]);
        const complete = rows.filter(row => keyOf(row) !== lastKey);
        if (complete.length > 0) usable = complete;
    }
    // Compare with isVersionNewer, not SQL MAX(version): version is not fixed-width.
    const newest = new Map<string, RetentionRow>();
    for (const row of usable) {
        const key = keyOf(row);
        const seen = newest.get(key);
        if (!seen || isVersionNewer(row.version, seen.version)) newest.set(key, row);
    }
    const keep = new Set([...newest.values()].map(row => row.id));
    const last = usable[usable.length - 1];
    return {
        tombstoneIds: usable.filter(row => !keep.has(row.id)).map(row => row.id),
        nextCursor: finished ? null : { stream: last.stream, entityId: last.entity_id },
        finished,
    };
}
