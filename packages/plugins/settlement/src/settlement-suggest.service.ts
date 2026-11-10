import { Injectable } from '@nestjs/common';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { applySuggest, clampSuggestLimit, dedupeSuggestions } from 'shared';
import { Counterparty, CounterpartyService } from '@mivend/plugin-counterparty';

import { SettlementDocumentEntry } from './entities/settlement-document-entry.entity';
import { SettlementDocumentType } from './entities/settlement-document-type.entity';
import { SettlementDocument } from './entities/settlement-document.entity';
import { settlementSuggestPrefix, settlementSuggestSpec } from './settlement-list-query';

type Visible = { sql: string; params: Record<string, unknown> } | null;

// Typeahead for the list filters: only values the caller's own list can show (same visibility scope).
@Injectable()
export class SettlementSuggestService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly counterparties: CounterpartyService,
    ) {}

    async suggest(
        ctx: RequestContext,
        field: string,
        prefix: string,
        limit?: number | null,
    ): Promise<string[]> {
        const spec = settlementSuggestSpec(field);
        const text = settlementSuggestPrefix(prefix);
        if (text === null) return [];
        const take = clampSuggestLimit(limit);
        const visible = await this.counterparties.visibleErpIdsSql(ctx);
        const qb = this.sourceQuery(ctx, field, visible);
        applySuggest(qb, spec, text, take);
        const rows = await qb.getRawMany<{ value: string | null }>();
        return dedupeSuggestions(rows, take);
    }

    private sourceQuery(
        ctx: RequestContext,
        field: string,
        visible: Visible,
    ): SelectQueryBuilder<ObjectLiteral> {
        if (field === 'customer') {
            const qb = this.connection.getRepository(ctx, Counterparty).createQueryBuilder('cp');
            return this.scoped(qb, '"cp"."erpId"', visible);
        }
        const qb = this.connection
            .getRepository(ctx, SettlementDocument)
            .createQueryBuilder('d')
            .innerJoin(SettlementDocumentEntry, 'e', '"e"."documentId" = "d"."id"')
            .leftJoin(
                SettlementDocumentType,
                'st',
                '"st"."documentType" = "d"."documentType" AND NOT "st"."isDeleted"',
            );
        return this.scoped(qb, '"e"."counterpartyErpId"', visible);
    }

    private scoped(
        qb: SelectQueryBuilder<ObjectLiteral>,
        erpIdSql: string,
        visible: Visible,
    ): SelectQueryBuilder<ObjectLiteral> {
        if (!visible) return qb;
        return qb.andWhere(`${erpIdSql} IN (${visible.sql})`, visible.params);
    }
}
