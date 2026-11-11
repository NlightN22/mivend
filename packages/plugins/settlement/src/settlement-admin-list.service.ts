import { Injectable } from '@nestjs/common';
import { Brackets, type SelectQueryBuilder } from 'typeorm';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { clampSkip, clampTake } from 'shared';
import { CounterpartyService } from '@mivend/plugin-counterparty';

import { SettlementDocumentEntry } from './entities/settlement-document-entry.entity';
import { SettlementDocumentType } from './entities/settlement-document-type.entity';
import { SettlementDocument } from './entities/settlement-document.entity';
import { toAlphaCurrency } from './currency-code';
import {
    CATEGORY_LIST_SQL,
    PROFORMA_NUMBER_SQL,
    TYPE_LABEL_SQL,
    applyListFilter,
    applyListSort,
} from './settlement-list-query';
import { normalizeCategory, INTERNAL_CATEGORIES } from './settlement-visibility';
import type {
    SettlementListItem,
    SettlementListOptions,
    SettlementListPage,
    SettlementTypeCount,
} from './settlement-admin.types';

type Raw = Record<string, unknown>;

// A counterparty id is a plain integer; anything else matches nothing, like a missing id.
export const isCounterpartyId = (value: string): boolean => /^\d{1,9}$/.test(value);
const escapeLike = (term: string): string => term.replace(/[\\%_]/g, '\\$&');
const ORDER_CODES_SQL = `COALESCE((SELECT json_agg(o."code" ORDER BY l."id")
    FROM "settlement_order_link" l
    JOIN "order" o ON o."id" = l."orderId" AND o."customFieldsCounterpartyid" = "e"."counterpartyId"
    WHERE l."entryId" = "e"."id"), '[]'::json)`;

// Staff-side read of the ERP settlement documents, scoped like the counterparty list itself.
@Injectable()
export class SettlementAdminListService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly counterparties: CounterpartyService,
    ) {}

    async findVisible(
        ctx: RequestContext,
        options?: SettlementListOptions | null,
        counterpartyId?: string | null,
    ): Promise<SettlementListPage> {
        if (counterpartyId && !isCounterpartyId(counterpartyId))
            return { items: [], totalItems: 0 };
        const take = clampTake(options?.take ?? undefined);
        const skip = clampSkip(options?.skip ?? undefined);
        const qb = await this.baseQuery(ctx, options, counterpartyId);
        if (options?.documentType) {
            qb.andWhere('"d"."documentType" = :documentType', {
                documentType: options.documentType,
            });
        }
        const totalItems = await qb.getCount();
        if (take === 0) return { items: [], totalItems };
        applyListSort(qb, options?.sort ?? undefined);
        const rows = await qb
            .select('"e"."id"', 'id')
            .addSelect('"d"."documentType"', 'documentType')
            .addSelect(TYPE_LABEL_SQL, 'documentTypeLabel')
            .addSelect(CATEGORY_LIST_SQL, 'category')
            .addSelect('"d"."number"', 'number')
            .addSelect('"d"."date"', 'date')
            .addSelect('"counterparty"."id"', 'counterpartyId')
            .addSelect('"counterparty"."shortName"', 'counterpartyShortName')
            .addSelect('"e"."organizationErpId"', 'organizationId')
            .addSelect('"org"."legalName"', 'organizationName')
            .addSelect('"e"."contractId"', 'contractId')
            .addSelect('"contract"."name"', 'contractName')
            .addSelect('"e"."currency"', 'currency')
            .addSelect('"e"."amountMinor"', 'amountMinor')
            .addSelect(ORDER_CODES_SQL, 'orderCodes')
            .addSelect(PROFORMA_NUMBER_SQL, 'proformaInvoiceNumber')
            .offset(skip)
            .limit(take)
            .getRawMany<Raw>();
        return { items: rows.map(toItem), totalItems };
    }

    // Follows the search and the filter but not the type itself; largest first, then by label.
    async typeCounts(
        ctx: RequestContext,
        options?: SettlementListOptions | null,
        counterpartyId?: string | null,
    ): Promise<SettlementTypeCount[]> {
        if (counterpartyId && !isCounterpartyId(counterpartyId)) return [];
        const qb = await this.baseQuery(ctx, options, counterpartyId);
        const rows = await qb
            .select('"d"."documentType"', 'documentType')
            .addSelect(`MIN(${TYPE_LABEL_SQL})`, 'label')
            .addSelect('COUNT(*)::int', 'count')
            .groupBy('"d"."documentType"')
            .orderBy('COUNT(*)', 'DESC')
            .addOrderBy(`MIN(${TYPE_LABEL_SQL})`, 'ASC')
            .addOrderBy('"d"."documentType"', 'ASC')
            .getRawMany<Raw>();
        return rows.map(r => ({
            documentType: String(r.documentType),
            label: String(r.label),
            count: Number(r.count),
        }));
    }

    // The scoped, filter-free list query; the global search adds its own predicate on top.
    async baseQuery(
        ctx: RequestContext,
        options: SettlementListOptions | null | undefined,
        counterpartyId: string | null | undefined,
    ): Promise<SelectQueryBuilder<SettlementDocumentEntry>> {
        const qb = this.connection
            .getRepository(ctx, SettlementDocumentEntry)
            .createQueryBuilder('e')
            .innerJoin(
                SettlementDocument,
                'd',
                '"d"."id" = "e"."documentId" AND NOT "d"."isDeleted"',
            )
            .leftJoin(
                SettlementDocumentType,
                't',
                '"t"."documentType" = "d"."documentType" AND NOT "t"."isDeleted"',
            )
            .leftJoin(
                'counterparty',
                'counterparty',
                '"counterparty"."erpId" = "e"."counterpartyErpId"',
            )
            .innerJoin('contract', 'contract', '"contract"."id"::text = "e"."contractId"')
            .leftJoin('organization_requisites', 'org', '"org"."erpId" = "e"."organizationErpId"')
            .where('"contract"."isCustomerContract" IS TRUE')
            .andWhere(
                `${CATEGORY_LIST_SQL} NOT IN (${INTERNAL_CATEGORIES.map(c => `'${c}'`).join(', ')})`,
            );
        const visible = await this.counterparties.visibleErpIdsSql(ctx);
        if (visible) qb.andWhere(`"e"."counterpartyErpId" IN (${visible.sql})`, visible.params);
        if (counterpartyId) {
            qb.andWhere('"counterparty"."id" = :setCounterpartyId', {
                setCounterpartyId: Number(counterpartyId),
            });
        }
        const search = options?.search?.trim();
        if (search) {
            const term = `%${escapeLike(search)}%`;
            qb.andWhere(
                new Brackets(b => {
                    b.where('"d"."number" ILIKE :setTerm')
                        .orWhere('"counterparty"."shortName" ILIKE :setTerm')
                        .orWhere('"counterparty"."legalName" ILIKE :setTerm')
                        .orWhere('"counterparty"."inn" ILIKE :setTerm')
                        .orWhere(`${ORDER_CODES_SQL}::text ILIKE :setTerm`);
                }),
                { setTerm: term },
            );
        }
        applyListFilter(qb, options?.filter ?? undefined);
        return qb;
    }
}

function toItem(r: Raw): SettlementListItem {
    return {
        id: String(r.id),
        documentType: String(r.documentType),
        documentTypeLabel: String(r.documentTypeLabel),
        category: normalizeCategory(r.category as string),
        number: String(r.number),
        date: new Date(r.date as string),
        counterpartyId: r.counterpartyId == null ? null : String(r.counterpartyId),
        counterpartyShortName: (r.counterpartyShortName as string | null) ?? null,
        organizationId: String(r.organizationId),
        organizationName: (r.organizationName as string | null) ?? null,
        contractId: (r.contractId as string | null) ?? null,
        contractName: (r.contractName as string | null) ?? null,
        currencyCode: toAlphaCurrency(String(r.currency)),
        amount: Number(r.amountMinor),
        orderCodes: r.orderCodes as string[],
        proformaInvoiceNumber: (r.proformaInvoiceNumber as string | null) ?? null,
    };
}
