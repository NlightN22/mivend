import type { OrderTurnoverRow } from './order-metrics.types';

const toCents = (amount: string): bigint => BigInt(amount.replace('.', ''));

function fromCents(cents: bigint): string {
    const negative = cents < 0n;
    const digits = (negative ? -cents : cents).toString().padStart(3, '0');
    return `${negative ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

const keyOf = (row: OrderTurnoverRow): string =>
    `${row.periodStart?.getTime() ?? ''}|${row.dimensionId}|${row.currency}`;

// Sums rows of the same bucket coming from separate requests; amounts are exact two-digit decimals.
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
                      turnover: fromCents(toCents(existing.turnover) + toCents(row.turnover)),
                      turnoverExcludingVat: fromCents(
                          toCents(existing.turnoverExcludingVat) +
                              toCents(row.turnoverExcludingVat),
                      ),
                      vatTotal: fromCents(toCents(existing.vatTotal) + toCents(row.vatTotal)),
                      orderCount: existing.orderCount + row.orderCount,
                      ordersWithoutAmount: existing.ordersWithoutAmount + row.ordersWithoutAmount,
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
