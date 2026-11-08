import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { ctxQuery } from 'shared';

export interface ScopeOption {
    ref: string;
    name: string;
}

// Each product-bound scope kind lists its selectable refs; $1 = refs to look up or null, $2 = search text or null.
const OPTION_SQL: Record<string, string> = {
    manufacturer: `SELECT "externalId" AS ref, COALESCE(name, "externalId") AS name FROM manufacturer
        WHERE ($1::text[] IS NULL OR "externalId" = ANY($1)) AND ($2::text IS NULL OR strpos(lower(COALESCE(name, '')), lower($2)) > 0)
        ORDER BY 2 LIMIT 50`,
    category: `SELECT DISTINCT ON (ct.slug) substr(ct.slug, 5) AS ref, ct.name AS name FROM collection_translation ct
        WHERE ct.slug LIKE 'cat-%' AND ($1::text[] IS NULL OR substr(ct.slug, 5) = ANY($1))
        AND ($2::text IS NULL OR strpos(lower(ct.name), lower($2)) > 0)
        ORDER BY ct.slug LIMIT 50`,
};

@Injectable()
export class DiscountLimitScopeOptionsService {
    constructor(private connection: TransactionalConnection) {}

    list(
        ctx: RequestContext,
        scopeKind: string,
        search?: string | null,
        refs?: string[] | null,
    ): Promise<ScopeOption[]> {
        const sql = OPTION_SQL[scopeKind];
        if (!sql) throw new UserInputError(`Unknown discount limit scope "${scopeKind}"`);
        return ctxQuery<ScopeOption[]>(this.connection, ctx, sql, [refs ?? null, search || null]);
    }
}
