import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { SettlementDocument } from './entities/settlement-document.entity';
import { toAlphaCurrency } from './currency-code';
import { averageCheck, computeWindows, type MetricsWindows } from './counterparty-metrics.windows';
import type {
    ContractBalanceRow,
    CounterpartyMetrics,
    CounterpartyMetricsProvider,
    CurrencyAmount,
} from './counterparty-metrics.types';

const MAX_CONTRACT_ROWS = 500;
const DEFAULT_CURRENCY = 'RUB';
// Same open-order set as the orders-attention counter in plugin-erp-order.
const NON_OPEN_STATES = ['AddingItems', 'Draft', 'Cancelled', 'Delivered'];

type Row = Record<string, unknown>;

interface TurnoverRow {
    currency: string;
    last30: number;
    prev30: number;
    last12: number;
    saleDocuments: number;
}

const BALANCES_SQL = `
    SELECT b.currency, SUM(b."closingBalance") AS total
    FROM settlement_balance b
    WHERE b."counterpartyId" = $1 AND NOT b."isDeleted"
    GROUP BY b.currency`;

const CONTRACTS_SQL = `
    SELECT b.currency, b."contractErpId", b."contractId", c.name AS "contractName",
        o."legalName" AS "organizationName", b."closingBalance", b."openingDate"
    FROM settlement_balance b
    LEFT JOIN contract c ON c.id::text = b."contractId"
    LEFT JOIN organization_requisites o ON o."erpId" = b."organizationErpId"
    WHERE b."counterpartyId" = $1 AND NOT b."isDeleted"
    ORDER BY ABS(b."closingBalance") DESC, b.id
    LIMIT ${MAX_CONTRACT_ROWS}`;

// Only document types flagged movesTurnover count (sales, sales corrections, returns); the average
// check divides by sale-category documents only.
const TURNOVER_SQL = `
    SELECT e.currency,
        COALESCE(SUM(e."amountMinor") FILTER (WHERE d.date >= $3), 0) AS last30,
        COALESCE(SUM(e."amountMinor") FILTER (WHERE d.date >= $4 AND d.date < $3), 0) AS prev30,
        COALESCE(SUM(e."amountMinor"), 0) AS last12,
        COUNT(DISTINCT d.id) FILTER (WHERE t.category = 'sale') AS "saleDocuments"
    FROM settlement_document_entry e
    JOIN settlement_document d ON d.id = e."documentId" AND NOT d."isDeleted"
        AND d.date >= $5 AND d.date < $2
    JOIN settlement_document_type t ON t."documentType" = d."documentType"
        AND NOT t."isDeleted" AND t."movesTurnover"
    WHERE e."counterpartyId" = $1
    GROUP BY e.currency`;

const OPEN_ORDERS_SQL = `
    SELECT COUNT(*) AS total FROM "order" o
    WHERE o."customFieldsCounterpartyid" = $1 AND o.state <> ALL($2::text[])`;

// Rows of one currency may arrive under both its numeric and alphabetic code.
function sumByCurrency<T>(rows: T[], code: (r: T) => string, value: (r: T) => number): Map<string, number> {
    const out = new Map<string, number>();
    for (const r of rows) {
        const key = toAlphaCurrency(code(r));
        out.set(key, (out.get(key) ?? 0) + value(r));
    }
    return out;
}

// Dominant currency = the one with the largest absolute balance, else the largest 12-month turnover.
function pickCurrency(balances: CurrencyAmount[], turnover: TurnoverRow[]): string {
    const byBalance = [...balances].sort((a, b) => Math.abs(b.amountMinor) - Math.abs(a.amountMinor))[0];
    if (byBalance) return byBalance.currency;
    const byTurnover = [...turnover].sort((a, b) => Math.abs(b.last12) - Math.abs(a.last12))[0];
    return byTurnover ? toAlphaCurrency(byTurnover.currency) : DEFAULT_CURRENCY;
}

@Injectable()
export class CounterpartyMetricsService implements CounterpartyMetricsProvider {
    constructor(private readonly connection: TransactionalConnection) {}

    private query(ctx: RequestContext, sql: string, params: unknown[]): Promise<Row[]> {
        return this.connection.getRepository(ctx, SettlementDocument).query(sql, params);
    }

    async metrics(
        ctx: RequestContext,
        counterpartyId: string,
        now: Date = new Date(),
    ): Promise<CounterpartyMetrics> {
        const w = computeWindows(now);
        const [balanceRows, contractRows, turnoverRows, orderRows] = await Promise.all([
            this.query(ctx, BALANCES_SQL, [counterpartyId]),
            this.query(ctx, CONTRACTS_SQL, [counterpartyId]),
            this.turnover(ctx, counterpartyId, w),
            this.query(ctx, OPEN_ORDERS_SQL, [counterpartyId, NON_OPEN_STATES]),
        ]);
        const totals = sumByCurrency(balanceRows, r => String(r.currency), r => Number(r.total));
        const balances = [...totals].map(([currency, amountMinor]) => ({ currency, amountMinor }));
        const currency = pickCurrency(balances, turnoverRows);
        const own = turnoverRows.filter(r => toAlphaCurrency(r.currency) === currency);
        const sum = (pick: (r: TurnoverRow) => number): number =>
            own.reduce((acc, r) => acc + pick(r), 0);
        const last12 = sum(r => r.last12);
        const saleDocuments = sum(r => r.saleDocuments);
        return {
            currency,
            balanceMinor: totals.get(currency) ?? 0,
            balances,
            contractBalances: contractRows.map(toContractBalance),
            salesLast30DaysMinor: sum(r => r.last30),
            salesPrev30DaysMinor: sum(r => r.prev30),
            salesLast12MonthsMinor: last12,
            saleDocumentsLast12Months: saleDocuments,
            averageCheckMinor: averageCheck(last12, saleDocuments),
            openOrdersCount: Number(orderRows[0]?.total ?? 0),
            computedAt: w.computedAt,
        };
    }

    private async turnover(
        ctx: RequestContext,
        counterpartyId: string,
        w: MetricsWindows,
    ): Promise<TurnoverRow[]> {
        const rows = await this.query(ctx, TURNOVER_SQL, [
            counterpartyId,
            w.endExclusive,
            w.last30Start,
            w.prev30Start,
            w.last12Start,
        ]);
        return rows.map(r => ({
            currency: String(r.currency),
            last30: Number(r.last30),
            prev30: Number(r.prev30),
            last12: Number(r.last12),
            saleDocuments: Number(r.saleDocuments),
        }));
    }
}

function toContractBalance(r: Row): ContractBalanceRow {
    return {
        contractId: (r.contractId as string | null) ?? null,
        contractErpId: String(r.contractErpId),
        contractName: (r.contractName as string | null) ?? null,
        organizationName: (r.organizationName as string | null) ?? null,
        currency: toAlphaCurrency(String(r.currency)),
        closingBalanceMinor: Number(r.closingBalance),
        openingDate: r.openingDate ? new Date(r.openingDate as string) : null,
    };
}
