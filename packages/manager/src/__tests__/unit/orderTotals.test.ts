import { describe, expect, it } from 'vitest';
import type { OrderDetailLine } from '../../api/orderDetail';
import { totalDiscountMinor } from '../../utils/orderTotals';

const line = (id: string, quantity: number, unit: number, discounted: number): OrderDetailLine =>
    ({
        id,
        quantity,
        unitPriceWithTax: unit,
        discountedUnitPriceWithTax: discounted,
    }) as OrderDetailLine;

describe('total discount', () => {
    it('sums reference minus effective price over the quantity, from the column percent', () => {
        // Manual price: line prices are equal, the server percent (from the base price) is 25.
        const manual = line('manual', 2, 7500, 7500);
        // Promotion: the line's own prices differ and there is no server percent.
        const promo = line('promo', 1, 5000, 4000);
        const server = new Map([['manual', { percent: 25 }]]);
        expect(totalDiscountMinor([manual, promo], l => server.get(l.id) ?? null)).toBe(
            2 * 2500 + 1000,
        );
    });

    it('counts a surcharge line as no discount', () => {
        const surcharge = line('s', 3, 1000, 1500);
        const server = new Map([['s', { percent: null }]]);
        expect(totalDiscountMinor([surcharge], l => server.get(l.id) ?? null)).toBe(0);
        expect(totalDiscountMinor([surcharge])).toBe(0);
    });

    it('is zero for an order without discounts', () => {
        expect(totalDiscountMinor([line('a', 1, 100, 100)])).toBe(0);
    });
});
