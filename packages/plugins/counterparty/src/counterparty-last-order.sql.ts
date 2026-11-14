import { ctxQueryBounded } from 'shared';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import type { SelectQueryBuilder } from 'typeorm';

import type { Counterparty } from './entities/counterparty.entity';

const ORDER_COUNTERPARTY = `COALESCE(o."customFieldsCounterpartyid", cu."customFieldsCounterpartyid")`;

const LAST_ORDER_ALIAS = 'lo';

// One grouped pass over the placed orders, joined once: a correlated subquery per counterparty is far too slow.
const LAST_ORDER_BY_COUNTERPARTY = `(SELECT ${ORDER_COUNTERPARTY} AS cp, MAX(o."orderPlacedAt") AS "lastOrderAt"
    FROM "order" o LEFT JOIN customer cu ON cu.id = o."customerId"
    WHERE o."orderPlacedAt" IS NOT NULL GROUP BY 1)`;

// Latest placement over all placed orders of the counterparty, whoever may see them (like balance and turnover).
export const LAST_ORDER_AT_SQL = `${LAST_ORDER_ALIAS}."lastOrderAt"`;

export function ensureLastOrderJoin(qb: SelectQueryBuilder<Counterparty>): void {
    if (qb.expressionMap.joinAttributes.some(j => j.alias.name === LAST_ORDER_ALIAS)) return;
    qb.leftJoin(
        LAST_ORDER_BY_COUNTERPARTY,
        LAST_ORDER_ALIAS,
        `${LAST_ORDER_ALIAS}.cp = c.id::text`,
    );
}

export function filterUsesLastOrder(filter: unknown): boolean {
    if (!filter || typeof filter !== 'object') return false;
    return Object.entries(filter as Record<string, unknown>).some(([key, value]) =>
        key === '_and' || key === '_or'
            ? Array.isArray(value) && value.some(filterUsesLastOrder)
            : key === 'lastOrderAt' && value != null,
    );
}

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
