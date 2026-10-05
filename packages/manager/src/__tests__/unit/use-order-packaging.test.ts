import { describe, it, expect } from 'vitest';
import { useOrderPackaging } from '../../composables/useOrderPackaging';

describe('useOrderPackaging', () => {
    it('sums weight/volume per piece across lines with a packaging unit', () => {
        const totals = useOrderPackaging([
            {
                quantity: 3,
                productVariant: {
                    customFields: { unitRatioToBase: 20, unitWeightKg: 10, unitVolumeM3: 8 },
                },
            },
            {
                quantity: 2,
                productVariant: {
                    customFields: { unitRatioToBase: 10, unitWeightKg: 5, unitVolumeM3: 4 },
                },
            },
        ]);

        expect(totals.totalWeightKg).toBeCloseTo(2.5);
        expect(totals.totalVolumeM3).toBeCloseTo(2);
    });

    it('contributes 0 for a plain per-piece line with no unit fields', () => {
        const totals = useOrderPackaging([
            {
                quantity: 5,
                productVariant: {
                    customFields: { unitRatioToBase: null, unitWeightKg: null, unitVolumeM3: null },
                },
            },
        ]);

        expect(totals.totalWeightKg).toBe(0);
        expect(totals.totalVolumeM3).toBe(0);
    });

    it('returns zero totals for an empty order', () => {
        expect(useOrderPackaging([])).toEqual({ totalWeightKg: 0, totalVolumeM3: 0 });
    });
});
