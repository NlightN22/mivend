import { Injectable } from '@nestjs/common';
import { RequestContextService, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

import { isVersionNewer } from './version-compare';

// Caps each purge call to a fixed number of (stream, entityId) duplicate groups so a large backlog
// cannot become one unbounded UPDATE; the remainder is taken on later calls.
const PURGE_SUPERSEDED_GROUP_BATCH_SIZE = 200;
const RETENTION_LOCK_KEY = 'inbox-retention';

interface CandidateRow {
    id: string;
    stream: string;
    entity_id: string;
    version: string;
}

// Retention of processed inbox rows, split from IntegrationInboxService (claim/retry code).
@Injectable()
export class IntegrationInboxRetentionService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly requestContextService: RequestContextService,
    ) {}

    // Older duplicates keep their row but get payload={}: the row is the enqueue dedup key.
    // Deleting it would let a Kafka redelivery pass dedup as new and reapply stale data.
    // A try-lock skips the call when another sweep is running, so sweeps never overlap.
    async purgeSupersededProcessedRows(): Promise<number> {
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        return this.connection.withTransaction(ctx, async txCtx => {
            const [lock] = await ctxQuery<Array<{ locked: boolean }>>(
                this.connection,
                txCtx,
                'select pg_try_advisory_xact_lock(hashtextextended($1, 0)) as locked',
                [RETENTION_LOCK_KEY],
            );
            if (!lock.locked) return 0;

            const rows = await ctxQuery<CandidateRow[]>(
                this.connection,
                txCtx,
                `WITH groups AS (
                    SELECT stream, entity_id FROM integration_inbox_event
                     WHERE status = 'processed' AND payload <> '{}'::jsonb
                     GROUP BY stream, entity_id HAVING COUNT(*) > 1 LIMIT $1)
                 SELECT e.id, e.stream, e.entity_id, e.version
                   FROM integration_inbox_event e
                   JOIN groups g ON g.stream = e.stream AND g.entity_id = e.entity_id
                  WHERE e.status = 'processed' AND e.payload <> '{}'::jsonb`,
                [PURGE_SUPERSEDED_GROUP_BATCH_SIZE],
            );
            // Compare with isVersionNewer, not SQL MAX(version): version is not fixed-width.
            const newest = new Map<string, CandidateRow>();
            for (const row of rows) {
                const key = `${row.stream}\u0000${row.entity_id}`;
                const seen = newest.get(key);
                if (!seen || isVersionNewer(row.version, seen.version)) newest.set(key, row);
            }
            const keep = new Set([...newest.values()].map(row => row.id));
            const ids = rows.filter(row => !keep.has(row.id)).map(row => row.id);
            if (ids.length === 0) return 0;
            await ctxQuery<unknown>(
                this.connection,
                txCtx,
                `UPDATE integration_inbox_event SET payload = '{}'::jsonb WHERE id = ANY($1::bigint[])`,
                [ids],
            );
            return ids.length;
        });
    }
}
