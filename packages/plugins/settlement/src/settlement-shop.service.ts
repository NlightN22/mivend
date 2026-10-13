import { Injectable } from '@nestjs/common';
import { GlobalSettingsService, RequestContext, TransactionalConnection } from '@vendure/core';

import { SettlementDocument } from './entities/settlement-document.entity';
import { capOverdue, paymentStatusOf } from './settlement-aging';
import { AGING_CTE, ORDER_REFS_SQL, escapeLike } from './settlement-shop.sql';
import type {
    SettlementBalanceCard,
    SettlementDocumentFilter,
    SettlementDocumentPage,
    SettlementDocumentRow,
    SettlementOrderRef,
} from './settlement-shop.types';
import { categoryOf, parseVisibility, type SettlementVisibility } from './settlement-visibility';

const MAX_PAGE = 100;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

type Row = Record<string, unknown>;

@Injectable()
export class SettlementShopService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly globalSettingsService: GlobalSettingsService,
    ) {}

    private query(ctx: RequestContext, sql: string, params: unknown[]): Promise<Row[]> {
        return this.connection.getRepository(ctx, SettlementDocument).query(sql, params);
    }

    private async visibility(ctx: RequestContext): Promise<SettlementVisibility> {
        const settings = await this.globalSettingsService.getSettings(ctx);
        return parseVisibility(settings.customFields ?? {});
    }

    async balanceCards(
        ctx: RequestContext,
        counterpartyId: string,
        filter: Pick<SettlementDocumentFilter, 'contractId' | 'organizationId'> = {},
    ): Promise<SettlementBalanceCard[]> {
        const visibility = await this.visibility(ctx);
        const rows = await this.query(
            ctx,
            `WITH ${AGING_CTE}
             SELECT bal.org AS "organizationErpId", bal.ctr AS "contractId", bal.currency,
                bal.ob AS "openingBalance", bal.cb AS "closingBalance", bal.cname AS "contractName",
                org."legalName" AS "organizationName",
                COALESCE((SELECT SUM(a.open) FROM aged a WHERE a.org = bal.org
                    AND a.ctr IS NOT DISTINCT FROM bal.ctr AND a.due < now()), 0) AS overdue
             FROM bal LEFT JOIN organization_requisites org ON org."erpId" = bal.org
             ORDER BY bal.org, bal.ctr`,
            [counterpartyId, kindsParam(visibility)],
        );
        return rows
            .map(
                (b): SettlementBalanceCard => ({
                    organizationId: String(b.organizationErpId),
                    organizationName: (b.organizationName as string | null) ?? null,
                    contractId: (b.contractId as string | null) ?? null,
                    contractName: (b.contractName as string | null) ?? null,
                    currency: String(b.currency),
                    openingBalance: Number(b.openingBalance),
                    currentBalance: Number(b.closingBalance),
                    overdue: capOverdue(Number(b.overdue), Number(b.closingBalance)),
                }),
            )
            .filter(
                c =>
                    (!filter.contractId || c.contractId === filter.contractId) &&
                    (!filter.organizationId || c.organizationId === filter.organizationId),
            );
    }

    async documents(
        ctx: RequestContext,
        counterpartyId: string,
        filter: SettlementDocumentFilter,
        skip: number,
        take: number,
    ): Promise<SettlementDocumentPage> {
        const visibility = await this.visibility(ctx);
        const typeKeys = [...visibility.typeCategories.keys()];
        const params: unknown[] = [
            counterpartyId,
            kindsParam(visibility),
            typeKeys.length > 0 ? typeKeys : null,
        ];
        const bind = (value: unknown): string => {
            params.push(value);
            return `$${params.length}`;
        };
        const where = [
            'e."counterpartyId" = $1',
            'NOT d."isDeleted"',
            '($2::text[] IS NULL OR c."contractKind" = ANY($2))',
            '($3::text[] IS NULL OR d."documentType" = ANY($3))',
        ];
        if (filter.contractId) where.push(`e."contractId" = ${bind(filter.contractId)}`);
        if (filter.organizationId) {
            where.push(`e."organizationErpId" = ${bind(filter.organizationId)}`);
        }
        if (filter.dateFrom && DATE_ONLY.test(filter.dateFrom)) {
            where.push(`d.date::date >= ${bind(filter.dateFrom)}::date`);
        }
        if (filter.dateTo && DATE_ONLY.test(filter.dateTo)) {
            where.push(`d.date::date <= ${bind(filter.dateTo)}::date`);
        }
        if (filter.search?.trim()) {
            const term = bind(`%${escapeLike(filter.search.trim())}%`);
            where.push(`(d.number ILIKE ${term} ESCAPE '\\' OR EXISTS (
                SELECT 1 FROM settlement_order_link l LEFT JOIN "order" o ON o.id = l."orderId"
                WHERE l."entryId" = e.id AND (l."orderErpId" ILIKE ${term} ESCAPE '\\'
                    OR (o."customFieldsCounterpartyid" = e."counterpartyId"
                        AND o.code ILIKE ${term} ESCAPE '\\'))))`);
        }
        if (filter.category) {
            const types = [...visibility.typeCategories]
                .filter(([, category]) => category === filter.category)
                .map(([type]) => type);
            if (visibility.typeCategories.size > 0) {
                where.push(`d."documentType" = ANY(${bind(types)})`);
            } else if (filter.category !== 'other') {
                where.push('FALSE');
            }
        }
        if (filter.overdueOnly) where.push('aged.open > 0 AND aged.due < now()');
        const from = `FROM settlement_document_entry e
            JOIN settlement_document d ON d.id = e."documentId"
            LEFT JOIN contract c ON c.id::text = e."contractId"
            LEFT JOIN organization_requisites org ON org."erpId" = e."organizationErpId"
            LEFT JOIN bal ON bal.org = e."organizationErpId"
                AND bal.ctr IS NOT DISTINCT FROM e."contractId"
            LEFT JOIN aged ON aged.id = e.id
            WHERE ${where.join(' AND ')}`;
        const [{ total }] = await this.query(
            ctx,
            `WITH ${AGING_CTE} SELECT COUNT(*)::int AS total ${from}`,
            params,
        );
        const limit = Math.min(Math.max(take, 1), MAX_PAGE);
        const rows = await this.query(
            ctx,
            `WITH ${AGING_CTE}
             SELECT e.id AS "entryId", d."documentType", d."documentTypeLabel", d.number, d.date,
                e."organizationErpId", org."legalName" AS "organizationName", e."contractId",
                c.name AS "contractName", e.currency, e."amountMinor", e."dueDate",
                aged.open AS "open", aged.due AS "agedDue", (bal.org IS NOT NULL) AS "hasBalance",
                ${ORDER_REFS_SQL} AS orders
             ${from}
             ORDER BY d.date DESC, e.id DESC LIMIT ${bind(limit)} OFFSET ${bind(Math.max(skip, 0))}`,
            params,
        );
        const now = new Date();
        return {
            items: rows.map(r => this.toRow(r, visibility, now)),
            totalItems: Number(total),
        };
    }

    private toRow(r: Row, visibility: SettlementVisibility, now: Date): SettlementDocumentRow {
        const amount = Number(r.amountMinor);
        const due = r.dueDate ?? r.agedDue;
        const dueDate = due ? new Date(due as string) : null;
        const open = r.open == null ? null : Number(r.open);
        const orders = (r.orders as Row[]).map(
            (o): SettlementOrderRef => ({
                orderId: o.orderId == null ? null : String(o.orderId),
                orderCode: (o.orderCode as string | null) ?? null,
                orderErpId: String(o.orderErpId),
                amount: Number(o.amount),
            }),
        );
        return {
            id: String(r.entryId),
            documentType: String(r.documentType),
            documentTypeLabel: String(r.documentTypeLabel),
            category: categoryOf(visibility, String(r.documentType)),
            number: String(r.number),
            date: new Date(r.date as string),
            organizationId: String(r.organizationErpId),
            organizationName: (r.organizationName as string | null) ?? null,
            contractId: (r.contractId as string | null) ?? null,
            contractName: (r.contractName as string | null) ?? null,
            currency: String(r.currency),
            amount,
            dueDate,
            paymentStatus: paymentStatusOf(amount, r.hasBalance ? open : null, dueDate, now),
            orders,
        };
    }
}

const kindsParam = (v: SettlementVisibility): string[] | null =>
    v.contractKinds.length > 0 ? v.contractKinds : null;
