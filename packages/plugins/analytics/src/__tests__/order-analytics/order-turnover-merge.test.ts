import { describe, expect, it } from 'vitest';

import type { OrderTurnoverRow } from '../../order-analytics/order-metrics.types';
import { mergeTurnoverRows } from '../../order-analytics/order-turnover-merge';

const row = (over: Partial<OrderTurnoverRow>): OrderTurnoverRow => ({
    periodStart: null,
    dimensionId: 'customer-1',
    currency: 'RUB',
    turnover: '10.00',
    turnoverExcludingVat: '8.33',
    vatTotal: '1.67',
    orderCount: 1,
    ordersWithoutAmount: 0,
    productQuantity: '',
    productAmount: '',
    productLinesWithoutAmount: 0,
    ...over,
});

describe('mergeTurnoverRows', () => {
    it('adds amounts exactly, without floating point drift', () => {
        const [merged] = mergeTurnoverRows([
            row({ turnover: '0.10', turnoverExcludingVat: '0.08', vatTotal: '0.02' }),
            row({ turnover: '0.20', turnoverExcludingVat: '0.17', vatTotal: '0.03' }),
        ]);
        expect(merged.turnover).toBe('0.30');
        expect(merged.turnoverExcludingVat).toBe('0.25');
        expect(merged.vatTotal).toBe('0.05');
    });

    it('adds product quantities with three digits and keeps unfilled values empty', () => {
        const [filled] = mergeTurnoverRows([
            row({ turnover: '', productQuantity: '1.250', productAmount: '10.00' }),
            row({ turnover: '', productQuantity: '2.755', productAmount: '5.50' }),
        ]);
        expect(filled.productQuantity).toBe('4.005');
        expect(filled.productAmount).toBe('15.50');
        expect(filled.turnover).toBe('');

        const [plain] = mergeTurnoverRows([row({}), row({})]);
        expect(plain.productQuantity).toBe('');
    });

    it('adds the counts of rows from separate requests', () => {
        const [merged] = mergeTurnoverRows([
            row({ orderCount: 3, ordersWithoutAmount: 1 }),
            row({ orderCount: 4, ordersWithoutAmount: 2 }),
        ]);
        expect(merged.orderCount).toBe(7);
        expect(merged.ordersWithoutAmount).toBe(3);
    });

    it('never adds different currencies, periods or dimensions together', () => {
        const day1 = new Date('2026-01-01T00:00:00Z');
        const day2 = new Date('2026-01-02T00:00:00Z');
        const merged = mergeTurnoverRows([
            row({ periodStart: day1 }),
            row({ periodStart: day2 }),
            row({ periodStart: day1, currency: 'USD' }),
            row({ periodStart: day1, dimensionId: 'customer-2' }),
        ]);
        expect(merged).toHaveLength(4);
    });

    it('carries amounts over a hundred correctly and keeps large sums exact', () => {
        const [merged] = mergeTurnoverRows([
            row({ turnover: '99.99' }),
            row({ turnover: '0.01' }),
            row({ turnover: '12345678901234.56' }),
        ]);
        expect(merged.turnover).toBe('12345678901334.56');
    });

    it('orders rows by period, then dimension, then currency', () => {
        const early = new Date('2026-01-01T00:00:00Z');
        const late = new Date('2026-02-01T00:00:00Z');
        const merged = mergeTurnoverRows([
            row({ periodStart: late, dimensionId: 'a' }),
            row({ periodStart: early, dimensionId: 'b' }),
            row({ periodStart: early, dimensionId: 'a' }),
        ]);
        expect(
            merged.map(r => `${r.periodStart?.toISOString().slice(0, 7)}${r.dimensionId}`),
        ).toEqual(['2026-01a', '2026-01b', '2026-02a']);
    });

    it('returns an empty list for no rows', () => {
        expect(mergeTurnoverRows([])).toEqual([]);
    });
});
