import { describe, expect, it } from 'vitest';
import type { OrderDetailLine } from '../../api/orderDetail';
import { totalDiscountMinor } from '../../utils/orderTotals';

const line = (quantity: number, unit: number, discounted: number): OrderDetailLine =>
    ({
        quantity,
        unitPriceWithTax: unit,
        discountedUnitPriceWithTax: discounted,
    }) as OrderDetailLine;

describe('total discount', () => {
    it('sums reference price minus effective price over the quantity', () => {
        expect(totalDiscountMinor([line(2, 10000, 9000), line(1, 5000, 4000)])).toBe(3000);
    });

    it('counts a surcharge line as no discount instead of subtracting it', () => {
        expect(totalDiscountMinor([line(2, 10000, 9000), line(3, 1000, 1500)])).toBe(2000);
    });

    it('is zero for an order without discounts', () => {
        expect(totalDiscountMinor([line(1, 100, 100)])).toBe(0);
    });
});
