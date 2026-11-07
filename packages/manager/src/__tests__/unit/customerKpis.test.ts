import { describe, expect, it } from 'vitest';
import { customerKpis } from '../../utils/customerKpis';

const NOW = new Date('2026-11-07T12:00:00Z').getTime();
const day = 24 * 60 * 60 * 1000;
const order = (state: string, daysAgo: number | null, total: number) => ({
    state,
    orderPlacedAt: daysAgo === null ? null : new Date(NOW - daysAgo * day).toISOString(),
    totalWithTax: total,
});

describe('customer KPI mapping', () => {
    const orders = [
        order('PaymentSettled', 5, 1000),
        order('Delivered', 10, 2000),
        order('Cancelled', 20, 4000),
        order('PaymentAuthorized', 40, 8000),
        order('AddingItems', null, 16000),
    ];

    it('sums sales placed in the last 30 days and counts non-closed orders', () => {
        const kpis = customerKpis(orders, null, null, NOW);
        expect(kpis.find(k => k.key === 'sales30d')?.value).toBe(7000);
        expect(kpis.find(k => k.key === 'openOrders')?.value).toBe(3);
    });

    it('shows a zero outstanding balance when none is returned', () => {
        expect(customerKpis([], null, null, NOW).find(k => k.key === 'outstanding')?.value).toBe(0);
        const withBalance = customerKpis([], null, { amount: 500, currencyCode: 'RUB' }, NOW);
        expect(withBalance.find(k => k.key === 'outstanding')?.value).toBe(500);
    });

    it('omits the credit cards without credit access and derives available credit with it', () => {
        expect(customerKpis([], null, null, NOW).map(k => k.key)).not.toContain('creditLimit');
        const kpis = customerKpis(
            [],
            { creditLimit: 1000, creditBalance: 300, paymentDelayDays: 0 },
            null,
            NOW,
        );
        expect(kpis.find(k => k.key === 'availableCredit')?.value).toBe(700);
        expect(kpis.find(k => k.key === 'creditLimit')?.value).toBe(1000);
    });
});
