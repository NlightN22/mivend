import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

interface IdSource {
    table: string;
    column: string;
}

// Aggregates whose local ids can be listed for an id diff. Constants only, never user input.
// The orders list is every stored order id: upstream's diff set also holds documents marked for deletion.
const ID_SOURCES: Readonly<Record<string, IdSource>> = {
    'customer-order': { table: '"order"', column: '"customFieldsErporderid"' },
};

// Document kinds are republished by uuid through the documents endpoint, which also supports a dry run.
export const DOCUMENT_KINDS: ReadonlySet<string> = new Set(['customer-order']);

export const hasLocalIdSource = (aggregateType: string): boolean => aggregateType in ID_SOURCES;

@Injectable()
export class ReconciliationLocalIdsService {
    constructor(private readonly connection: TransactionalConnection) {}

    // Ascending in the C collation, the order the diff endpoint walks; keyset paging, never OFFSET.
    async idPage(
        ctx: RequestContext,
        aggregateType: string,
        afterId: string | null,
        size: number,
    ): Promise<string[]> {
        const { table, column } = ID_SOURCES[aggregateType];
        const rows = await ctxQuery<Array<{ id: string }>>(
            this.connection,
            ctx,
            `SELECT ${column} AS id FROM ${table}
             WHERE ${column} IS NOT NULL AND ($1::text IS NULL OR ${column} COLLATE "C" > $1::text COLLATE "C")
             ORDER BY ${column} COLLATE "C" LIMIT $2`,
            [afterId, size],
        );
        return rows.map(r => r.id);
    }
}
