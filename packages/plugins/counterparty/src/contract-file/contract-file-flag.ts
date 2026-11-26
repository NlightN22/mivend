import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

import { UNSCANNED_ACTIVE_CONTRACT_SQL } from './contract-file-sql';

export async function loadUnscannedFlags(
    connection: TransactionalConnection,
    ctx: RequestContext,
    ids: string[],
): Promise<Map<string, boolean>> {
    if (!ids.length) return new Map();
    const rows = await ctxQuery<Array<{ id: string; flag: boolean }>>(
        connection,
        ctx,
        `SELECT c.id::text AS id, (${UNSCANNED_ACTIVE_CONTRACT_SQL}) AS flag
         FROM counterparty c WHERE c.id = ANY($1::int[])`,
        [ids.map(Number)],
    );
    return new Map(rows.map(r => [r.id, r.flag]));
}
