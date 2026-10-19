import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

import type { IntegrationInboxEvent } from '../entities/integration-inbox-event.entity';

// A replayed event with an empty payload carries no state, so it must not hide an earlier tombstone.
export async function isWarehouseTombstoned(
    connection: TransactionalConnection,
    ctx: RequestContext,
    warehouseErpId: string,
): Promise<boolean> {
    const rows = await ctxQuery<
        Array<{ status: IntegrationInboxEvent['status']; isDeleted: string | null }>
    >(
        connection,
        ctx,
        `SELECT e.status AS status, e.payload->>'isDeleted' AS "isDeleted"
           FROM integration_inbox_event e
          WHERE e.stream = 'warehouse' AND e.entity_id = $1 AND e.payload <> '{}'::jsonb
          ORDER BY e.id DESC LIMIT 1`,
        [warehouseErpId],
    );
    const latest = rows[0];
    return latest?.status === 'processed' && latest.isDeleted === 'true';
}
