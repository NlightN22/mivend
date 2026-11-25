import { sumDecimals } from '../order-analytics/order-turnover-merge';
import type { SalesAmount, SalesTurnoverRow } from './sales-metrics.types';

const sumAmounts = (a: SalesAmount, b: SalesAmount): SalesAmount => ({
    amount: sumDecimals(a.amount, b.amount, 2),
    amountExcludingVatBasis: sumDecimals(a.amountExcludingVatBasis, b.amountExcludingVatBasis, 2),
    documentCount: a.documentCount + b.documentCount,
    documentsWithoutAmount: a.documentsWithoutAmount + b.documentsWithoutAmount,
});

const keyOf = (row: SalesTurnoverRow): string =>
    `${row.periodStart?.getTime() ?? ''}|${row.dimensionId}|${row.currency}`;

// Sums rows of the same bucket coming from separate requests; currencies stay separate rows, never added.
export function mergeSalesRows(rows: SalesTurnoverRow[]): SalesTurnoverRow[] {
    const merged = new Map<string, SalesTurnoverRow>();
    for (const row of rows) {
        const key = keyOf(row);
        const existing = merged.get(key);
        merged.set(
            key,
            existing
                ? {
                      ...existing,
                      sales: sumAmounts(existing.sales, row.sales),
                      returns: sumAmounts(existing.returns, row.returns),
                      corrections: sumAmounts(existing.corrections, row.corrections),
                      netSales: sumAmounts(existing.netSales, row.netSales),
                  }
                : row,
        );
    }
    return [...merged.values()].sort(
        (a, b) =>
            (a.periodStart?.getTime() ?? 0) - (b.periodStart?.getTime() ?? 0) ||
            a.dimensionId.localeCompare(b.dimensionId) ||
            a.currency.localeCompare(b.currency),
    );
}
