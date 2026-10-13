import { Injectable } from '@nestjs/common';
import { GlobalSettingsService, RequestContext, TransactionalConnection } from '@vendure/core';

import { SettlementDocument } from './entities/settlement-document.entity';
import { ageEntries, paymentStatusOf } from './settlement-aging';
import { ENTRY_JOINS, ORDER_REFS_SQL, scopeClause } from './settlement-shop.sql';
import type {
    SettlementBalanceCard,
    SettlementDocumentFilter,
    SettlementDocumentPage,
    SettlementDocumentRow,
    SettlementEntryAging,
    SettlementOrderRef,
} from './settlement-shop.types';
import { categoryOf, parseVisibility, type SettlementVisibility } from './settlement-visibility';

const MAX_PAGE = 100;

type Row = Record<string, unknown>;

interface Aging {
    entries: Map<string, SettlementEntryAging>;
    cards: SettlementBalanceCard[];
}

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
        const aging = await this.loadAging(ctx, counterpartyId, await this.visibility(ctx));
        return aging.cards.filter(
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
        const aging = await this.loadAging(ctx, counterpartyId, visibility);
        const now = new Date();
        const scope = scopeClause(counterpartyId, visibility, true);
        const params = [...scope.params];
        const where = [scope.sql];
        const bind = (value: unknown): string => {
            params.push(value);
            return `$${params.length}`;
        };
        if (filter.contractId) where.push(`e."contractId" = ${bind(filter.contractId)}`);
        if (filter.organizationId) {
            where.push(`e."organizationErpId" = ${bind(filter.organizationId)}`);
        }
        if (filter.dateFrom) where.push(`d.date >= ${bind(filter.dateFrom)}`);
        if (filter.dateTo) where.push(`d.date <= ${bind(filter.dateTo)}`);
        if (filter.search?.trim()) {
            const term = bind(`%${filter.search.trim()}%`);
            where.push(`(d.number ILIKE ${term} OR EXISTS (
                SELECT 1 FROM settlement_order_link l LEFT JOIN "order" o ON o.id = l."orderId"
                WHERE l."entryId" = e.id AND (l."orderErpId" ILIKE ${term}
                    OR (o."customFieldsCounterpartyid" = e."counterpartyId" AND o.code ILIKE ${term}))))`);
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
        if (filter.overdueOnly) {
            const ids = [...aging.entries]
                .filter(([, a]) => a.open > 0 && a.due !== null && a.due < now)
                .map(([id]) => Number(id));
            where.push(`e.id = ANY(${bind(ids)})`);
        }
        const whereSql = where.join(' AND ');
        const [{ total }] = await this.query(
            ctx,
            `SELECT COUNT(*)::int AS total ${ENTRY_JOINS} WHERE ${whereSql}`,
            params,
        );
        const limit = Math.min(Math.max(take, 1), MAX_PAGE);
        const rows = await this.query(
            ctx,
            `SELECT e.id AS "entryId", d."documentType", d."documentTypeLabel", d.number, d.date,
                e."organizationErpId", org."legalName" AS "organizationName", e."contractId",
                c.name AS "contractName", e.currency, e."amountMinor", e."dueDate",
                ${ORDER_REFS_SQL} AS orders
             ${ENTRY_JOINS} WHERE ${whereSql}
             ORDER BY d.date DESC, e.id DESC LIMIT ${bind(limit)} OFFSET ${bind(Math.max(skip, 0))}`,
            params,
        );
        return {
            items: rows.map(r => this.toRow(r, visibility, aging, now)),
            totalItems: Number(total),
        };
    }

    private toRow(
        r: Row,
        visibility: SettlementVisibility,
        aging: Aging,
        now: Date,
    ): SettlementDocumentRow {
        const id = String(r.entryId);
        const amount = Number(r.amountMinor);
        const known = aging.entries.get(id);
        const orders = (r.orders as Row[]).map(
            (o): SettlementOrderRef => ({
                orderId: o.orderId == null ? null : String(o.orderId),
                orderCode: (o.orderCode as string | null) ?? null,
                orderErpId: String(o.orderErpId),
                amount: Number(o.amount),
            }),
        );
        return {
            id,
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
            dueDate: r.dueDate ? new Date(r.dueDate as string) : (known?.due ?? null),
            paymentStatus: paymentStatusOf(amount, known?.open, known?.due ?? undefined, now),
            orders,
        };
    }

    private async loadAging(
        ctx: RequestContext,
        counterpartyId: string,
        visibility: SettlementVisibility,
    ): Promise<Aging> {
        const kindSql = visibility.contractKinds.length > 0 ? 'AND c."contractKind" = ANY($2)' : '';
        const kindParams = visibility.contractKinds.length > 0 ? [visibility.contractKinds] : [];
        const balances = await this.query(
            ctx,
            `SELECT b."organizationErpId", b."contractId", b.currency, b."openingDate",
                b."openingBalance", b."closingBalance", org."legalName" AS "organizationName",
                c.name AS "contractName", c."paymentDelayDays"
             FROM settlement_balance b
             LEFT JOIN contract c ON c.id::text = b."contractId"
             LEFT JOIN organization_requisites org ON org."erpId" = b."organizationErpId"
             WHERE b."counterpartyId" = $1 AND NOT b."isDeleted" ${kindSql}`,
            [counterpartyId, ...kindParams],
        );
        const scope = scopeClause(counterpartyId, visibility, false);
        const entries = await this.query(
            ctx,
            `SELECT e.id, e."organizationErpId", e."contractId", d.date, e."amountMinor", e."dueDate"
             ${ENTRY_JOINS} WHERE ${scope.sql}`,
            scope.params,
        );
        const byTriple = new Map<string, Row[]>();
        for (const e of entries) {
            const key = `${String(e.organizationErpId)}|${String(e.contractId)}`;
            byTriple.set(key, [...(byTriple.get(key) ?? []), e]);
        }
        const now = new Date();
        const result: Aging = { entries: new Map(), cards: [] };
        for (const b of balances) {
            const key = `${String(b.organizationErpId)}|${String(b.contractId)}`;
            const aged = ageEntries({
                openingBalanceMinor: Number(b.openingBalance),
                openingDate: b.openingDate ? new Date(b.openingDate as string) : null,
                delayDays: b.paymentDelayDays == null ? null : Number(b.paymentDelayDays),
                now,
                entries: (byTriple.get(key) ?? []).map(e => ({
                    key: String(e.id),
                    date: new Date(e.date as string),
                    amountMinor: Number(e.amountMinor),
                    dueDate: e.dueDate ? new Date(e.dueDate as string) : null,
                })),
            });
            for (const [entryKey, open] of aged.openByKey) {
                if (entryKey === 'opening') continue;
                result.entries.set(entryKey, {
                    open,
                    due: aged.dueByKey.get(entryKey) ?? null,
                });
            }
            result.cards.push({
                organizationId: String(b.organizationErpId),
                organizationName: (b.organizationName as string | null) ?? null,
                contractId: (b.contractId as string | null) ?? null,
                contractName: (b.contractName as string | null) ?? null,
                currency: String(b.currency),
                openingBalance: Number(b.openingBalance),
                currentBalance: Number(b.closingBalance),
                overdue: aged.overdueMinor,
            });
        }
        return result;
    }
}
