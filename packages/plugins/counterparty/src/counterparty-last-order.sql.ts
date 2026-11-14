import { ctxQueryBounded } from 'shared';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

const ORDER_COUNTERPARTY = `COALESCE(o."customFieldsCounterpartyid", cu."customFieldsCounterpartyid")`;

// Latest placement over all placed orders of the counterparty, whoever may see them (like balance and turnover).
export const LAST_ORDER_AT_SQL = `(SELECT MAX(o."orderPlacedAt") FROM "order" o
    LEFT JOIN customer cu ON cu.id = o."customerId"
    WHERE o."orderPlacedAt" IS NOT NULL AND ${ORDER_COUNTERPARTY} = c.id::text)`;

export async function loadLastOrderDates(
    connection: Pick<TransactionalConnection, 'getRepository'>,
    ctx: RequestContext,
    counterpartyIds: readonly string[],
): Promise<Map<string, Date>> {
    if (counterpartyIds.length === 0) return new Map();
    const rows = await ctxQueryBounded<{ id: string; lastOrderAt: Date }>(
        connection,
        ctx,
        `SELECT ${ORDER_COUNTERPARTY} AS id, MAX(o."orderPlacedAt") AS "lastOrderAt"
         FROM "order" o LEFT JOIN customer cu ON cu.id = o."customerId"
         WHERE o."orderPlacedAt" IS NOT NULL AND ${ORDER_COUNTERPARTY} = ANY($1::text[])
         GROUP BY 1`,
        [counterpartyIds],
        counterpartyIds.length,
    );
    return new Map(rows.map(r => [r.id, r.lastOrderAt]));
}
