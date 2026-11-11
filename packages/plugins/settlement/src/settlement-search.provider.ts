import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Permission } from '@vendure/common/lib/generated-types';
import { RequestContext } from '@vendure/core';
import { likeTerm, normalizeDocumentNumber } from 'shared';
import { CustomPermission } from '@mivend/plugin-access-control';
import { StaffSearchRegistry, type GlobalSearchHit } from '@mivend/plugin-staff-search';

import { SettlementAdminListService } from './settlement-admin-list.service';
import { CATEGORY_LIST_SQL, TYPE_LABEL_SQL } from './settlement-list-query';

export const SETTLEMENT_SEARCH_KIND = 'settlementDocument';
const TRIGRAM_MIN = 3;
const PREFIX_CANDIDATES = 200;

// Trigrams need 3+ characters, so a 2-character term is a bounded prefix match on the existing btree.
// The id array is an InitPlan evaluated first: otherwise a rare term walks the whole date index for the ORDER BY.
export function numberMatch(term: string): { sql: string; params: Record<string, string> } {
    const from = 'SELECT "s"."id" FROM "settlement_document" "s"';
    return term.length < TRIGRAM_MIN
        ? {
              sql: `${from} WHERE lower("s"."number") COLLATE "C" LIKE lower(:gsTerm) || '%' ORDER BY lower("s"."number") COLLATE "C" LIMIT ${PREFIX_CANDIDATES}`,
              params: { gsTerm: term.replace(/[\\%_]/g, '\\$&') },
          }
        : { sql: `${from} WHERE "s"."number" ILIKE :gsTerm`, params: { gsTerm: likeTerm(term) } };
}

// Searches the document number inside the very query the settlement list is built from (same scope, same exclusions).
@Injectable()
export class SettlementSearchProvider implements OnApplicationBootstrap {
    constructor(
        private readonly registry: StaffSearchRegistry,
        private readonly list: SettlementAdminListService,
    ) {}

    onApplicationBootstrap(): void {
        this.registry.register({
            kind: SETTLEMENT_SEARCH_KIND,
            position: 40,
            permissions: [CustomPermission.ReadSettlementDocument.Permission as Permission],
            search: (ctx, term, limit) => this.search(ctx, term, limit),
        });
    }

    async search(ctx: RequestContext, term: string, limit: number): Promise<GlobalSearchHit[]> {
        const qb = await this.list.baseQuery(ctx, undefined, undefined);
        const number = numberMatch(normalizeDocumentNumber(term));
        const rows = await qb
            .andWhere(`"d"."id" = ANY (ARRAY(${number.sql}))`, number.params)
            .select('"e"."id"', 'id')
            .addSelect('"d"."number"', 'number')
            .addSelect(TYPE_LABEL_SQL, 'label')
            .addSelect(CATEGORY_LIST_SQL, 'category')
            .addSelect('"counterparty"."id"', 'counterpartyId')
            .addSelect('"counterparty"."shortName"', 'counterpartyName')
            .orderBy('"d"."date"', 'DESC')
            .addOrderBy('"e"."id"', 'DESC')
            .limit(limit)
            .getRawMany<Record<string, unknown>>();
        return rows.map(r => ({
            id: String(r.id),
            number: String(r.number),
            title: String(r.label),
            subtitle: (r.counterpartyName as string | null) ?? null,
            status: String(r.category),
            counterpartyId: r.counterpartyId == null ? null : String(r.counterpartyId),
        }));
    }
}
