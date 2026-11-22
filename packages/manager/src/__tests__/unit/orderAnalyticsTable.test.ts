import { describe, expect, it } from 'vitest';
import {
    formatAmount,
    pageOf,
    searchRows,
    sortRows,
    toTableRows,
} from '../../components/analytics/orderAnalyticsTable';
import type { OrderAnalyticsRow } from '../../api/orderAnalytics';
import { isValidPeriod, periodInstants } from '../../api/orderAnalyticsPeriod';

const row = (over: Partial<OrderAnalyticsRow> = {}): OrderAnalyticsRow => ({
    periodStart: null,
    dimensionId: 'c1',
    label: 'Customer One',
    currency: 'RUB',
    turnover: '10.00',
    turnoverExcludingVat: '8.33',
    vatTotal: '1.67',
    orderCount: 2,
    ordersWithoutAmount: 0,
    ...over,
});

const format = (iso: string): string => `period:${iso.slice(0, 7)}`;

describe('toTableRows', () => {
    it('titles a row by its entity, else its period, else the total', () => {
        const rows = toTableRows(
            [
                row(),
                row({ label: '', periodStart: '2026-03-01T00:00:00Z' }),
                row({ label: '', periodStart: null }),
            ],
            'Total',
            format,
        );
        expect(rows.map(r => r.title)).toEqual(['Customer One', 'period:2026-03', 'Total']);
    });

    it('gives every row a distinct key even for repeated entities', () => {
        const rows = toTableRows([row(), row()], 'Total', format);
        expect(new Set(rows.map(r => r.key)).size).toBe(2);
    });
});

describe('searchRows', () => {
    const rows = toTableRows([row({ label: 'Alpha' }), row({ label: 'Beta' })], 'Total', format);

    it('matches the title case-insensitively and ignores surrounding blanks', () => {
        expect(searchRows(rows, '  ALP ').map(r => r.title)).toEqual(['Alpha']);
    });

    it('keeps every row for an empty term', () => {
        expect(searchRows(rows, '')).toHaveLength(2);
    });
});

describe('sortRows', () => {
    const rows = toTableRows(
        [
            row({ label: 'B', turnover: '9.99', orderCount: 10 }),
            row({ label: 'A', turnover: '100.00', orderCount: 2 }),
        ],
        'Total',
        format,
    );

    it('sorts amounts as numbers, not as text', () => {
        expect(sortRows(rows, { field: 'turnover', order: 1 }).map(r => r.title)).toEqual([
            'B',
            'A',
        ]);
        expect(sortRows(rows, { field: 'turnover', order: -1 }).map(r => r.title)).toEqual([
            'A',
            'B',
        ]);
    });

    it('sorts counts numerically and titles alphabetically', () => {
        expect(sortRows(rows, { field: 'orderCount', order: 1 }).map(r => r.title)).toEqual([
            'A',
            'B',
        ]);
        expect(sortRows(rows, { field: 'title', order: 1 }).map(r => r.title)).toEqual(['A', 'B']);
    });

    it('keeps the server order without a sort and never mutates the input', () => {
        expect(sortRows(rows, undefined)).toBe(rows);
        const before = rows.map(r => r.title);
        sortRows(rows, { field: 'title', order: 1 });
        expect(rows.map(r => r.title)).toEqual(before);
    });
});

describe('pageOf', () => {
    it('slices a page and returns the short last page', () => {
        const items = [1, 2, 3, 4, 5];
        expect(pageOf(items, 1, 2)).toEqual([1, 2]);
        expect(pageOf(items, 3, 2)).toEqual([5]);
        expect(pageOf(items, 4, 2)).toEqual([]);
    });
});

describe('formatAmount', () => {
    it('shows two fraction digits with the currency when the source gave one', () => {
        expect(formatAmount('1234.5', 'RUB', 'en-US')).toContain('1,234.50');
    });

    it('shows a plain number when the currency is unknown', () => {
        expect(formatAmount('1234.50', '', 'en-US')).toBe('1,234.50');
    });

    it('does not throw on a currency code the browser does not know', () => {
        expect(formatAmount('5.00', 'ZZ', 'en-US')).toContain('5.00');
    });

    it('returns the original text for something that is not a number', () => {
        expect(formatAmount('n/a', 'RUB', 'en-US')).toBe('n/a');
    });
});

describe('period helpers', () => {
    it('turns the last picked day into an exclusive instant a day later', () => {
        const { from, to } = periodInstants({ from: '2026-03-01', to: '2026-03-31' });
        expect(new Date(to).getTime() - new Date(from).getTime()).toBeGreaterThanOrEqual(
            30 * 24 * 3600 * 1000 - 3600 * 1000,
        );
        expect(new Date(from).getTime()).toBe(new Date('2026-03-01T00:00:00').getTime());
        expect(new Date(to).getTime()).toBe(new Date('2026-04-01T00:00:00').getTime());
    });

    it('accepts a one-day period and rejects an end before the start or an empty date', () => {
        expect(isValidPeriod({ from: '2026-03-05', to: '2026-03-05' })).toBe(true);
        expect(isValidPeriod({ from: '2026-03-06', to: '2026-03-05' })).toBe(false);
        expect(isValidPeriod({ from: '', to: '2026-03-05' })).toBe(false);
    });
});
