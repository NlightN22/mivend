import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { ctxQuery } from './ctx-query';
import type { FilterTerm } from './selection-filter';

export interface FilterTermTable {
    table: string;
    ownerColumn: string;
}

type Connection = Pick<TransactionalConnection, 'getRepository'>;

// Identifiers are code constants; call inside the owner's lock so the terms change as a unit.
export async function replaceFilterTerms(
    connection: Connection,
    ctx: RequestContext,
    spec: FilterTermTable,
    ownerId: number,
    terms: FilterTerm[],
): Promise<void> {
    await ctxQuery(
        connection,
        ctx,
        `DELETE FROM "${spec.table}" WHERE "${spec.ownerColumn}" = $1`,
        [ownerId],
    );
    if (terms.length === 0) return;
    await ctxQuery(
        connection,
        ctx,
        `INSERT INTO "${spec.table}" ("${spec.ownerColumn}", side, position, field, hierarchical, negated, refs)
         SELECT $1, t.side, t.position, t.field, t.hierarchical, t.negated, t.refs
         FROM jsonb_to_recordset($2::jsonb)
           AS t(side text, position int, field text, hierarchical boolean, negated boolean, refs jsonb)`,
        [ownerId, JSON.stringify(terms)],
    );
}

export async function loadFilterTerms(
    connection: Connection,
    ctx: RequestContext,
    spec: FilterTermTable,
    ownerIds: number[],
): Promise<Map<number, FilterTerm[]>> {
    const byOwner = new Map<number, FilterTerm[]>();
    if (ownerIds.length === 0) return byOwner;
    const rows = await ctxQuery<Array<FilterTerm & { ownerId: number }>>(
        connection,
        ctx,
        `SELECT "${spec.ownerColumn}" AS "ownerId", side, position, field, hierarchical, negated, refs
         FROM "${spec.table}" WHERE "${spec.ownerColumn}" = ANY($1::int[]) ORDER BY position`,
        [ownerIds],
    );
    for (const { ownerId, ...term } of rows) {
        const list = byOwner.get(ownerId) ?? [];
        list.push(term);
        byOwner.set(ownerId, list);
    }
    return byOwner;
}
