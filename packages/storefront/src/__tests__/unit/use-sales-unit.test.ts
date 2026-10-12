import { describe, expect, it } from 'vitest';

import {
    baseToPacks,
    nearestPackOf,
    nextPackAbove,
    packsToBase,
    salesUnitOf,
} from '../../composables/useSalesUnit';

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
        expect(salesUnitOf({ unitName: 'pack', unitRatioToBase: 2.5 }, true)?.packStep).toBe(2);
    });

    it('turns one step of packs into a whole base quantity', () => {
        const slow = salesUnitOf({ unitName: 'pack', unitRatioToBase: 0.9 }, true)!;
        const half = salesUnitOf({ unitName: 'pack', unitRatioToBase: 2.5 }, true)!;
        expect(packsToBase(slow.packStep, slow)).toBe(9);
        expect(packsToBase(half.packStep, half)).toBe(5);
    });
});

describe('pack conversion', () => {
    it('converts between packs and base units', () => {
        const unit = salesUnitOf(variant, true)!;
        expect(packsToBase(3, unit)).toBe(18);
        expect(baseToPacks(18, unit)).toBe(3);
    });
});

describe('nearestPackOf', () => {
    it('prefers the variant default unit, else the smallest level above 1', () => {
        const levels = [
            { name: 'box', ratioToBase: 10 },
            { name: 'pallet', ratioToBase: 200 },
        ];
        expect(nearestPackOf(variant, levels)).toEqual({ name: 'pack', ratio: 6, baseQty: 6 });
        expect(nearestPackOf({}, levels)).toEqual({ name: 'box', ratio: 10, baseQty: 10 });
        expect(nearestPackOf({}, [{ name: 'tray', ratioToBase: 2.5 }])).toEqual({
            name: 'tray',
            ratio: 2.5,
            baseQty: 5,
        });
        expect(nearestPackOf({}, [])).toBeNull();
    });
});

describe('nextPackAbove', () => {
    const levels = [
        { name: 'pack', ratioToBase: 12 },
        { name: 'box', ratioToBase: 48 },
    ];

    it('offers the smallest pack when sold in pieces', () => {
        expect(nextPackAbove(null, levels, 1)?.baseQty).toBe(12);
    });

    it('skips the pack the item is already sold in', () => {
        expect(nextPackAbove({ unitName: 'pack', unitRatioToBase: 12 }, levels, 12)?.baseQty).toBe(
            48,
        );
        expect(nextPackAbove({ unitName: 'box', unitRatioToBase: 48 }, levels, 48)).toBeNull();
    });
});
