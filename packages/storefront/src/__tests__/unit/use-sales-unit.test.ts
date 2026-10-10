import { describe, expect, it } from 'vitest';

import { baseToPacks, packsToBase, salesUnitOf } from '../../composables/useSalesUnit';

const variant = { unitName: 'pack', unitRatioToBase: 6 };

describe('salesUnitOf', () => {
    it('returns the unit only for a packages-only branch with a non-base default unit', () => {
        expect(salesUnitOf(variant, true)).toEqual({ name: 'pack', ratio: 6, packStep: 1 });
        expect(salesUnitOf(variant, false)).toBeNull();
        expect(salesUnitOf({ unitName: 'pack', unitRatioToBase: 1 }, true)).toBeNull();
        expect(salesUnitOf({ unitRatioToBase: 6 }, true)).toBeNull();
    });

    it('steps a ratio below 1 in the smallest whole number of packs', () => {
        expect(salesUnitOf({ unitName: 'pack', unitRatioToBase: 0.9 }, true)?.packStep).toBe(10);
    });
});

describe('pack conversion', () => {
    it('converts between packs and base units', () => {
        const unit = salesUnitOf(variant, true)!;
        expect(packsToBase(3, unit)).toBe(18);
        expect(baseToPacks(18, unit)).toBe(3);
    });
});
