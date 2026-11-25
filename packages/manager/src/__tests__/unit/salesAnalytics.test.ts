import { describe, expect, it } from 'vitest';
import type { FilterCondition } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterBuilderTypes';
import {
    buildEntityFilterColumns,
    conditionsToEntityFilters,
} from '../../api/orderAnalyticsFilter';
import { SALES_FILTER_KEYS, type SalesAnalyticsRow } from '../../api/salesAnalytics';
import { buildSalesAnalyticsColumns } from '../../components/analytics/salesAnalyticsColumns';
import { toSalesTableRows } from '../../components/analytics/salesAnalyticsTable';
import { sortRows } from '../../components/analytics/orderAnalyticsTable';
import {
    formatSalesRow,
    SALES_AMOUNT_FIELDS,
} from '../../components/analytics/salesAnalyticsTable';
import en from '../../i18n/en/analytics';
import ru from '../../i18n/ru/analytics';

const amount = (value: string, without = 0) => ({
    amount: value,
    amountExcludingVatBasis: '0.00',
    documentCount: 2,
    documentsWithoutAmount: without,
});

const row = (over: Partial<SalesAnalyticsRow> = {}): SalesAnalyticsRow => ({
    periodStart: null,
    dimensionId: 'c1',
    label: 'Customer One',
    currency: '643',
    sales: amount('1000.50', 1),
    returns: amount('100.00', 2),
    corrections: amount('-5.00'),
    netSales: amount('895.50'),
    ...over,
});

const cond = (columnKey: string, value: string): FilterCondition => ({
    columnKey,
    operator: 'contains' as const,
    value,
});

describe('sales filters', () => {
    it('maps the four sales entities and ignores order-only columns', () => {
        expect(
            conditionsToEntityFilters(
                [cond('contract', 'Main'), cond('customer', 'Acme'), cond('product', 'bolt')],
                SALES_FILTER_KEYS,
            ),
        ).toEqual([
            { kind: 'CONTRACT', values: ['Main'] },
            { kind: 'CUSTOMER', values: ['Acme'] },
        ]);
        expect(buildEntityFilterColumns(SALES_FILTER_KEYS, 'sales').map(c => c.key)).toEqual([
            'customer',
            'organization',
            'contract',
            'counterpartyManager',
        ]);
    });
});

describe('sales table rows', () => {
    it('keeps each currency group as its own row with the currency as given', () => {
        const rows = toSalesTableRows(
            [row(), row({ currency: 'guid-1' })],
            'Total',
            iso => iso,
            'None',
        );
        expect(rows.map(r => r.currency)).toEqual(['643', 'guid-1']);
        expect(rows[0].key).not.toBe(rows[1].key);
    });

    it('shows amounts plain and sums the documents without amount of all measures', () => {
        const [r] = toSalesTableRows([row()], 'Total', iso => iso, 'None');
        expect(formatSalesRow(r, 'en').netSales).toBe('895.50');
        expect(r.corrections).toBe('-5.00');
        expect(r.documentsWithoutAmount).toBe(3);
        expect(r.documentCount).toBe(2);
    });

    it('titles a row by entity, then "not specified", then period, then total', () => {
        const title = (over: Partial<SalesAnalyticsRow>, noEntity?: string): string =>
            toSalesTableRows([row(over)], 'Total', () => 'Jan', noEntity)[0].title;
        expect(title({})).toBe('Customer One');
        expect(title({ label: '', dimensionId: '' }, 'None')).toBe('None');
        expect(title({ label: '', dimensionId: '', periodStart: '2026-01-01T00:00:00Z' })).toBe(
            'Jan',
        );
        expect(title({ label: '', dimensionId: '' })).toBe('Total');
    });

    it('sorts amounts as numbers', () => {
        const rows = toSalesTableRows(
            [
                row({ netSales: amount('90.00') }),
                row({ netSales: amount('1000.00'), currency: 'RUB' }),
            ],
            'Total',
            iso => iso,
            'None',
        );
        const sorted = sortRows(rows, { field: 'netSales', order: -1 }, SALES_AMOUNT_FIELDS);
        expect(sorted[0].netSales).toBe('1000.00');
        expect(formatSalesRow(sorted[0], 'en').netSales).toBe('1,000.00');
    });
});

describe('sales columns and texts', () => {
    it('shows the currency and the signal columns, the period only when asked', () => {
        const fields = (period: boolean): string[] =>
            buildSalesAnalyticsColumns(period).map(c => c.field);
        expect(fields(false)).not.toContain('period');
        expect(fields(true)).toEqual(
            expect.arrayContaining([
                'currency',
                'netSales',
                'netSalesExcludingVatBasis',
                'documentsWithoutAmount',
            ]),
        );
    });

    it('has the same sales text keys in English and Russian', () => {
        const keys = (o: unknown, p = ''): string[] =>
            Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
                typeof v === 'object' && v ? keys(v, `${p}${k}.`) : [`${p}${k}`],
            );
        expect(keys(ru.sales).sort()).toEqual(keys(en.sales).sort());
    });
});
