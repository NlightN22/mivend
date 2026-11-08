import { describe, it, expect } from 'vitest';

import { discountPercent, exceedsCeiling } from '../../discount-percent';
import { reductionRefusal } from '../../discount-reduction.rule';

describe('reductionRefusal', () => {
    const base = { current: 80, reference: 100 };

    it('refuses a target below the current price (a deeper discount)', () => {
        expect(reductionRefusal({ ...base, target: 79 })).toBe('increases-discount');
        expect(reductionRefusal({ ...base, target: 0 })).toBe('increases-discount');
    });

    it('accepts an equal or higher target up to the reference price', () => {
        expect(reductionRefusal({ ...base, target: 80 })).toBeNull();
        expect(reductionRefusal({ ...base, target: 90 })).toBeNull();
        expect(reductionRefusal({ ...base, target: 100 })).toBeNull();
    });

    it('refuses to go past the reference price into a markup', () => {
        expect(reductionRefusal({ ...base, target: 101 })).toBe('beyond-reference');
    });

    it('leaves an existing markup as it is but never deepens it into a discount', () => {
        const markup = { current: 120, reference: 100 };
        expect(reductionRefusal({ ...markup, target: 120 })).toBeNull();
        expect(reductionRefusal({ ...markup, target: 121 })).toBe('beyond-reference');
        expect(reductionRefusal({ ...markup, target: 110 })).toBe('increases-discount');
    });
});

describe('discountPercent', () => {
    it('measures the share of the reference price given away, to 2 decimals', () => {
        expect(discountPercent(200, 150)).toBe(25);
        expect(discountPercent(3, 2)).toBe(33.33);
        expect(discountPercent(100, 120)).toBe(-20);
    });

    it('is unknown without a positive reference price', () => {
        expect(discountPercent(0, 0)).toBeNull();
    });

    it('exceedsCeiling never flags an unknown percent or an unset ceiling', () => {
        expect(exceedsCeiling(50, null)).toBe(false);
        expect(exceedsCeiling(null, 10)).toBe(false);
        expect(exceedsCeiling(10, 10)).toBe(false);
        expect(exceedsCeiling(10.01, 10)).toBe(true);
    });
});
