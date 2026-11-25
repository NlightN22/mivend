import { describe, expect, it } from 'vitest';

import type { SalesAmount, SalesTurnoverRow } from '../../sales-analytics/sales-metrics.types';
import { mergeSalesRows } from '../../sales-analytics/sales-turnover-merge';

const amount = (value: string, documents = 1, without = 0): SalesAmount => ({
    amount: value,
    amountExcludingVatBasis: '0.00',
    documentCount: documents,
    documentsWithoutAmount: without,
});

const row = (over: Partial<SalesTurnoverRow> = {}): SalesTurnoverRow => ({
    periodStart: null,
    dimensionId: 'c1',
    currency: 'RUB',
    sales: amount('10.00'),
    returns: amount('1.00'),
    corrections: amount('-0.50'),
    netSales: amount('8.50'),
    ...over,
});

describe('mergeSalesRows', () => {
    it('adds every measure of one bucket exactly', () => {
        const [merged] = mergeSalesRows([
            row({ sales: amount('0.10', 2, 1) }),
            row({ sales: amount('0.20', 3, 0) }),
        ]);
        expect(merged.sales).toMatchObject({
            amount: '0.30',
            documentCount: 5,
            documentsWithoutAmount: 1,
        });
        expect(merged.corrections.amount).toBe('-1.00');
        expect(merged.netSales.amount).toBe('17.00');
    });

    it('never adds different currencies or different dimension ids', () => {
        const merged = mergeSalesRows([
            row({ currency: 'RUB' }),
            row({ currency: '643' }),
            row({ dimensionId: 'c2' }),
        ]);
        expect(merged).toHaveLength(3);
    });

    it('orders rows by period, dimension and currency', () => {
        const merged = mergeSalesRows([
            row({ periodStart: new Date('2026-02-01T00:00:00Z') }),
            row({ periodStart: new Date('2026-01-01T00:00:00Z') }),
        ]);
        expect(merged.map(r => r.periodStart?.toISOString())).toEqual([
            '2026-01-01T00:00:00.000Z',
            '2026-02-01T00:00:00.000Z',
        ]);
    });
});
