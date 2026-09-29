import { describe, it, expect } from 'vitest';
import { useOrderPackaging } from '../../composables/useOrderPackaging';

describe('useOrderPackaging', () => {
    it('sums weight/volume per piece across lines with a packaging unit', () => {
        const totals = useOrderPackaging([
            {
                quantity: 3,
                productVariant: {
                    customFields: { unitRatioToBase: 20, unitWeightKg: 10, unitVolumeL: 8 },
                },
            },
            {
                quantity: 2,
                productVariant: {
                    customFields: { unitRatioToBase: 10, unitWeightKg: 5, unitVolumeL: 4 },
                },
            },
        ]);

        // line 1: (10/20)*3 = 1.5, line 2: (5/10)*2 = 1
        expect(totals.totalWeightKg).toBeCloseTo(2.5);
        // line 1: (8/20)*3 = 1.2, line 2: (4/10)*2 = 0.8
        expect(totals.totalVolumeL).toBeCloseTo(2);
    });

    it('contributes 0 for a plain per-piece line with no unit fields', () => {
        const totals = useOrderPackaging([
            { quantity: 5, productVariant: { customFields: null } },
            {
                quantity: 2,
                productVariant: {
                    customFields: { unitRatioToBase: null, unitWeightKg: null, unitVolumeL: null },
                },
            },
        ]);

        expect(totals.totalWeightKg).toBe(0);
        expect(totals.totalVolumeL).toBe(0);
    });

    it('returns zero totals for an empty order', () => {
        expect(useOrderPackaging([])).toEqual({ totalWeightKg: 0, totalVolumeL: 0 });
    });
});
