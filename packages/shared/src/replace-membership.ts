import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { ctxQuery } from './ctx-query';

const INSERT_CHUNK = 20_000;

export interface MembershipTable {
    table: string;
    ownerColumn: string;
    valueColumn: string;
}

// Makes the stored set equal to `values` without rewriting unchanged rows. Identifiers are code
// constants, never user input; call inside the owner's lock so the set is replaced as a unit.
export async function replaceMembership(
    connection: Pick<TransactionalConnection, 'getRepository'>,
    ctx: RequestContext,
    spec: MembershipTable,
    ownerId: number,
    values: string[],
): Promise<void> {
    const { table, ownerColumn, valueColumn } = spec;
    const unique = [...new Set(values)];
    await ctxQuery(
        connection,
        ctx,
        `DELETE FROM "${table}" WHERE ctid IN (
             SELECT t.ctid FROM "${table}" t
             LEFT JOIN unnest($2::text[]) AS v(x) ON v.x = t."${valueColumn}"
             WHERE t."${ownerColumn}" = $1 AND v.x IS NULL)`,
        [ownerId, unique],
    );
    for (let start = 0; start < unique.length; start += INSERT_CHUNK) {
        await ctxQuery(
            connection,
            ctx,
            `INSERT INTO "${table}" ("${ownerColumn}", "${valueColumn}")
             SELECT $1, x FROM unnest($2::text[]) AS x ON CONFLICT DO NOTHING`,
            [ownerId, unique.slice(start, start + INSERT_CHUNK)],
        );
    }
}
