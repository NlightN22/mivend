import type { DataTableSortMeta } from '@mivend/ui-kit';
import type { OrderAnalyticsRow } from '../../api/orderAnalytics';

export interface OrderAnalyticsTableRow {
    [key: string]: unknown;
    key: string;
    title: string;
    period: string | null;
    currency: string;
    orderCount: number;
    ordersWithoutAmount: number;
    turnover: string;
    turnoverExcludingVat: string;
    vatTotal: string;
    productQuantity: string;
    productAmount: string;
    productLinesWithoutAmount: number;
}

// Amounts are exact decimal strings; sorting compares them as numbers only for ordering.
const amountOf = (value: string): number => Number(value);

export function toTableRows(
    rows: OrderAnalyticsRow[],
    labelOfTotal: string,
    formatPeriod: (iso: string) => string,
    // Set when the report is broken down by an entity: its rows without an id are the "not specified" group.
    labelOfNoEntity?: string,
): OrderAnalyticsTableRow[] {
    return rows.map((row, index) => ({
        key: `${index}:${row.periodStart ?? ''}:${row.dimensionId}:${row.currency}`,
        title:
            row.label ||
            (labelOfNoEntity && !row.dimensionId ? labelOfNoEntity : null) ||
            (row.periodStart ? formatPeriod(row.periodStart) : labelOfTotal),
        period: row.periodStart,
        currency: row.currency,
        orderCount: row.orderCount,
        ordersWithoutAmount: row.ordersWithoutAmount,
        turnover: row.turnover,
        turnoverExcludingVat: row.turnoverExcludingVat,
        vatTotal: row.vatTotal,
        productQuantity: row.productQuantity,
        productAmount: row.productAmount,
        productLinesWithoutAmount: row.productLinesWithoutAmount,
    }));
}

export function searchRows(rows: OrderAnalyticsTableRow[], term: string): OrderAnalyticsTableRow[] {
    const needle = term.trim().toLowerCase();
    return needle ? rows.filter(row => row.title.toLowerCase().includes(needle)) : rows;
}

export const AMOUNT_FIELDS = new Set([
    'turnover',
    'turnoverExcludingVat',
    'vatTotal',
    'productQuantity',
    'productAmount',
]);

export function sortRows<T extends { [key: string]: unknown }>(
    rows: T[],
    sort: DataTableSortMeta | undefined,
    amountFields: Set<string> = AMOUNT_FIELDS,
): T[] {
    if (!sort) return rows;
    const { field, order } = sort;
    return [...rows].sort((a, b) => {
        const left = a[field];
        const right = b[field];
        const result = amountFields.has(field)
            ? amountOf(String(left)) - amountOf(String(right))
            : typeof left === 'number' && typeof right === 'number'
              ? left - right
              : String(left ?? '').localeCompare(String(right ?? ''));
        return result * order;
    });
}

export function pageOf<T>(rows: T[], page: number, pageSize: number): T[] {
    return rows.slice((page - 1) * pageSize, page * pageSize);
}

// Decimal string to a localized amount; the currency is shown only when the source gave one.
export function formatAmount(amount: string, currency: string, locale: string): string {
    const value = Number(amount);
    if (!Number.isFinite(value)) return amount;
    const plain = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    try {
        return new Intl.NumberFormat(
            locale,
            currency ? { ...plain, style: 'currency', currency } : plain,
        ).format(value);
    } catch {
        return `${new Intl.NumberFormat(locale, plain).format(value)} ${currency}`;
    }
}

// Quantity is a decimal string with three digits in the lines' own units; no currency.
export function formatQuantity(quantity: string, locale: string): string {
    const value = Number(quantity);
    return Number.isFinite(value)
        ? new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value)
        : quantity;
}
