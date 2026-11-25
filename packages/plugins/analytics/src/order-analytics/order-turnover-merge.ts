import type { OrderTurnoverRow } from './order-metrics.types';

const toUnits = (amount: string): bigint => BigInt(amount.replace('.', '') || '0');

function fromUnits(units: bigint, fraction: number): string {
    const negative = units < 0n;
    const digits = (negative ? -units : units).toString().padStart(fraction + 1, '0');
    return `${negative ? '-' : ''}${digits.slice(0, -fraction)}.${digits.slice(-fraction)}`;
}

// An empty string means "not filled" (the amounts of a product-filtered row); it stays empty unless a side has a value.
export function sumDecimals(a: string, b: string, fraction: number): string {
    if (!a && !b) return '';
    return fromUnits(toUnits(a) + toUnits(b), fraction);
}

const keyOf = (row: OrderTurnoverRow): string =>
    `${row.periodStart?.getTime() ?? ''}|${row.dimensionId}|${row.currency}`;

// Sums rows of the same bucket coming from separate requests; amounts are exact decimals.
export function mergeTurnoverRows(rows: OrderTurnoverRow[]): OrderTurnoverRow[] {
    const merged = new Map<string, OrderTurnoverRow>();
    for (const row of rows) {
        const key = keyOf(row);
        const existing = merged.get(key);
        merged.set(
            key,
            existing
                ? {
                      ...existing,
                      turnover: sumDecimals(existing.turnover, row.turnover, 2),
                      turnoverExcludingVat: sumDecimals(
                          existing.turnoverExcludingVat,
                          row.turnoverExcludingVat,
                          2,
                      ),
                      vatTotal: sumDecimals(existing.vatTotal, row.vatTotal, 2),
                      orderCount: existing.orderCount + row.orderCount,
                      ordersWithoutAmount: existing.ordersWithoutAmount + row.ordersWithoutAmount,
                      productQuantity: sumDecimals(
                          existing.productQuantity,
                          row.productQuantity,
                          3,
                      ),
                      productAmount: sumDecimals(existing.productAmount, row.productAmount, 2),
                      productLinesWithoutAmount:
                          existing.productLinesWithoutAmount + row.productLinesWithoutAmount,
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
