import { describe, it, expect } from 'vitest';
import { deriveLinePricing } from '../../utils/linePricing';

describe('deriveLinePricing', () => {
    it('derives unit and total without strikethrough when there is no discount', () => {
        const p = deriveLinePricing({
            quantity: 6,
            discountedUnitPriceWithTax: 20350,
            compareAtPrice: null,
            discountedLinePriceWithTax: 122100,
        });
        expect(p).toEqual({ unit: 203.5, total: 1221, oldUnit: null, oldTotal: null });
    });

    it('returns struck-through unit and total when compareAtPrice is higher', () => {
        const p = deriveLinePricing({
            quantity: 2,
            discountedUnitPriceWithTax: 9000,
            compareAtPrice: 10000,
            discountedLinePriceWithTax: 18000,
        });
        expect(p.unit).toBe(90);
        expect(p.total).toBe(180);
        expect(p.oldUnit).toBeCloseTo(100);
        expect(p.oldTotal).toBeCloseTo(200);
    });

    it('treats zero discount (compareAt equals unit) as not discounted', () => {
        const p = deriveLinePricing({
            quantity: 1,
            discountedUnitPriceWithTax: 100,
            compareAtPrice: 100,
            discountedLinePriceWithTax: 100,
        });
        expect(p.oldUnit).toBeNull();
        expect(p.oldTotal).toBeNull();
    });

    it('recomputes for a new quantity when line total is scaled optimistically', () => {
        const p = deriveLinePricing({
            quantity: 4,
            discountedUnitPriceWithTax: 9000,
            compareAtPrice: 10000,
            discountedLinePriceWithTax: 36000,
        });
        expect(p.unit).toBe(90);
        expect(p.oldTotal).toBeCloseTo(400);
    });

    it('guards zero quantity and zero unit price', () => {
        const p = deriveLinePricing({
            quantity: 0,
            discountedUnitPriceWithTax: 0,
            compareAtPrice: 50,
            discountedLinePriceWithTax: 0,
        });
        expect(p).toEqual({ unit: 0, total: 0, oldUnit: null, oldTotal: null });
    });
});
