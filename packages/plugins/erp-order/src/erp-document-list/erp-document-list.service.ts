import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { Brackets, type SelectQueryBuilder } from 'typeorm';
import {
    toAlphaCurrency,
    clampSkip,
    clampTake,
    likeTerm,
    normalizeDocumentNumber,
    type ListFilter,
} from 'shared';
import { CustomPermission } from '@mivend/plugin-access-control';
import { CounterpartyService, PowerOfAttorneyListService } from '@mivend/plugin-counterparty';

import {
    applyErpDocumentFilter,
    applyErpDocumentSort,
    type ErpDocumentListInput,
} from './erp-document-list-query';
import { ErpDocumentLineSummaryService } from './erp-document-line-summary.service';
import { ERP_DOCUMENT_KINDS, type ErpDocumentKind } from './erp-document-kinds';
import type {
    ErpDocumentCounts,
    ErpDocumentListItem,
    ErpDocumentPage,
} from './erp-document-list.types';

const MAX_SEARCH_LENGTH = 200;

type Raw = Record<string, unknown>;
const text = (v: unknown): string | null => (v == null ? null : String(v));

// Staff read of the ERP documents, scoped by the counterparty visibility; tombstoned rows never show.
@Injectable()
export class ErpDocumentListService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly counterparties: CounterpartyService,
        private readonly lines: ErpDocumentLineSummaryService,
        private readonly powersOfAttorney: PowerOfAttorneyListService,
    ) {}

    async findVisible(
        ctx: RequestContext,
        kind: ErpDocumentKind,
        input: ErpDocumentListInput = {},
    ): Promise<ErpDocumentPage> {
        const take = clampTake(input.take ?? undefined);
        const qb = await this.baseQuery(ctx, kind, input.search, input.filter);
        const totalItems = await qb.getCount();
        if (take === 0) return { items: [], totalItems };
        applyErpDocumentSort(kind, qb, input.sort);
        const config = ERP_DOCUMENT_KINDS[kind];
        const rows = await qb
            .select('"t"."id"', 'id')
            .addSelect('"t"."number"', 'number')
            .addSelect('"t"."date"', 'date')
            .addSelect('"t"."totalAmountMinor"', 'amountMinor')
            .addSelect('"t"."comment"', 'comment')
            .addSelect('"cp"."id"', 'counterpartyId')
            .addSelect('"cp"."shortName"', 'counterpartyName')
            .addSelect('"o"."id"', 'orderId')
            .addSelect('"o"."code"', 'orderCode')
            .addSelect('"org"."legalName"', 'organizationName')
            .addSelect(config.hasContract ? '"ct"."name"' : 'NULL', 'contractName')
            .addSelect(config.hasCurrency ? '"t"."currency"' : 'NULL', 'currency')
            .offset(clampSkip(input.skip ?? undefined))
            .limit(take)
            .getRawMany<Raw>();
        const summaries = await this.lines.summarize(
            ctx,
            config.lineTables,
            rows.map(r => Number(r.id)),
        );
        return { items: rows.map(r => toItem(r, summaries.get(Number(r.id)))), totalItems };
    }

    async relatedCounts(
        ctx: RequestContext,
        orderId?: string | null,
        counterpartyId?: string | null,
    ): Promise<ErpDocumentCounts> {
        const filter: ListFilter = {};
        if (orderId) filter.orderId = { eq: orderId };
        if (counterpartyId) filter.counterpartyId = { eq: counterpartyId };
        if (!orderId && !counterpartyId) {
            throw new UserInputError('Pass an order or a counterparty');
        }
        const count = async (kind: ErpDocumentKind): Promise<number> =>
            (await this.baseQuery(ctx, kind, null, filter)).getCount();
        const [customerClaims, salesCorrections, orderCorrections, powersOfAttorney] =
            await Promise.all([
                count('customerClaim'),
                count('salesCorrection'),
                count('orderCorrection'),
                counterpartyId &&
                ctx.userHasPermissions([CustomPermission.ReadCounterparty.Permission])
                    ? this.powersOfAttorney.countForCounterparty(ctx, counterpartyId)
                    : 0,
            ]);
        return { customerClaims, salesCorrections, orderCorrections, powersOfAttorney };
    }

    private async baseQuery(
        ctx: RequestContext,
        kind: ErpDocumentKind,
        search: string | null | undefined,
        filter: ListFilter | null | undefined,
    ): Promise<SelectQueryBuilder<object>> {
        const config = ERP_DOCUMENT_KINDS[kind];
        const qb: SelectQueryBuilder<object> = this.connection
            .getRepository(ctx, config.entity)
            .createQueryBuilder('t')
            .leftJoin('counterparty', 'cp', '"cp"."erpId" = "t"."counterpartyId"')
            .leftJoin('order', 'o', '"o"."customFieldsErporderid" = "t"."orderId"')
            .leftJoin('organization_requisites', 'org', '"org"."erpId" = "t"."organizationId"')
            .where('NOT "t"."isDeleted"');
        if (config.hasContract) qb.leftJoin('contract', 'ct', '"ct"."erpId" = "t"."contractId"');
        const visible = await this.counterparties.visibleErpIdsSql(ctx);
        if (visible) qb.andWhere(`"t"."counterpartyId" IN (${visible.sql})`, visible.params);
        const term = search?.trim();
        if (term) {
            if (term.length > MAX_SEARCH_LENGTH) {
                throw new UserInputError(`Search is limited to ${MAX_SEARCH_LENGTH} characters`);
            }
            qb.andWhere(
                new Brackets(b => {
                    b.where('"t"."number" ILIKE :edTerm')
                        .orWhere('"o"."code" ILIKE :edCodeTerm')
                        .orWhere('"cp"."shortName" ILIKE :edTerm')
                        .orWhere('"cp"."legalName" ILIKE :edTerm')
                        .orWhere('"cp"."inn" ILIKE :edTerm');
                }),
                { edTerm: likeTerm(term), edCodeTerm: likeTerm(normalizeDocumentNumber(term)) },
            );
        }
        applyErpDocumentFilter(kind, qb, filter);
        return qb;
    }
}

export function toItem(
    r: Raw,
    summary: { lineCount: number; productNames: string[] } | undefined,
): ErpDocumentListItem {
    return {
        id: String(r.id),
        number: String(r.number),
        date: r.date == null ? null : new Date(r.date as string),
        counterpartyId: text(r.counterpartyId),
        counterpartyName: text(r.counterpartyName),
        orderId: text(r.orderId),
        orderCode: text(r.orderCode),
        organizationName: text(r.organizationName),
        contractName: text(r.contractName),
        currency: r.currency == null ? null : toAlphaCurrency(String(r.currency)),
        amount: Number(r.amountMinor),
        comment: text(r.comment),
        lineCount: summary?.lineCount ?? 0,
        productNames: summary?.productNames ?? [],
    };
}
