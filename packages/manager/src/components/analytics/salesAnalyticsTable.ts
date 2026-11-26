import type { SalesAnalyticsRow } from '../../api/salesAnalytics';
import { AMOUNT_FIELDS, formatAmount } from './orderAnalyticsTable';

export interface SalesAnalyticsTableRow {
    [key: string]: unknown;
    key: string;
    title: string;
    period: string | null;
    periodIso: string | null;
    currency: string;
    sales: string;
    returns: string;
    corrections: string;
    netSales: string;
    netSalesExcludingVatBasis: string;
    documentCount: number;
    documentsWithoutAmount: number;
}

export const SALES_AMOUNT_FIELDS = new Set([
    ...AMOUNT_FIELDS,
    'sales',
    'returns',
    'corrections',
    'netSales',
    'netSalesExcludingVatBasis',
]);

// Amounts stay exact decimal strings so sorting compares numbers; `formatSalesRow` localizes them for display.
export function toSalesTableRows(
    rows: SalesAnalyticsRow[],
    labelOfTotal: string,
    formatPeriod: (iso: string) => string,
    labelOfNoEntity: string | undefined,
): SalesAnalyticsTableRow[] {
    return rows.map((row, index) => ({
        key: `${index}:${row.periodStart ?? ''}:${row.dimensionId}:${row.currency}`,
        title:
            row.label ||
            (labelOfNoEntity && !row.dimensionId ? labelOfNoEntity : null) ||
            (row.periodStart ? formatPeriod(row.periodStart) : labelOfTotal),
        period: row.periodStart ? formatPeriod(row.periodStart) : null,
        periodIso: row.periodStart,
        currency: row.currency,
        sales: row.sales.amount,
        returns: row.returns.amount,
        corrections: row.corrections.amount,
        netSales: row.netSales.amount,
        netSalesExcludingVatBasis: row.netSales.amountExcludingVatBasis,
        documentCount: row.sales.documentCount,
        documentsWithoutAmount:
            row.sales.documentsWithoutAmount +
            row.returns.documentsWithoutAmount +
            row.corrections.documentsWithoutAmount,
    }));
}

// The currency is its own column, so amounts are shown plain: the server resolves ids and numeric codes through the currency catalog.
export function formatSalesRow(
    row: SalesAnalyticsTableRow,
    locale: string,
): SalesAnalyticsTableRow {
    const plain = (amount: unknown): string => formatAmount(String(amount), locale);
    return {
        ...row,
        sales: plain(row.sales),
        returns: plain(row.returns),
        corrections: plain(row.corrections),
        netSales: plain(row.netSales),
        netSalesExcludingVatBasis: plain(row.netSalesExcludingVatBasis),
    };
}
