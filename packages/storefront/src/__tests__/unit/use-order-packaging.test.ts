import { describe, it, expect } from 'vitest';
import { formatPackaging, useOrderPackaging } from '../../composables/useOrderPackaging';

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

        // line 1: (10/20)*3 = 1.5, line 2: (5/10)*2 = 1
        expect(totals.totalWeightKg).toBeCloseTo(2.5);
        // line 1: (8/20)*3 = 1.2, line 2: (4/10)*2 = 0.8
        expect(totals.totalVolumeM3).toBeCloseTo(2);
    });

    it('contributes 0 for a plain per-piece line with no unit fields', () => {
        const totals = useOrderPackaging([
            { quantity: 5, productVariant: { customFields: null } },
            {
                quantity: 2,
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

describe('formatPackaging', () => {
    it('shows weight and volume, with a floor for tiny volumes', () => {
        expect(formatPackaging({ totalWeightKg: 3.84, totalVolumeM3: 0.0123 })).toBe(
            '3.8 kg · 0.012 m³',
        );
        expect(formatPackaging({ totalWeightKg: 0.1, totalVolumeM3: 0.0002 })).toBe(
            '0.1 kg · < 0.001 m³',
        );
    });

    it('omits an unknown (zero) volume and returns null for an empty order', () => {
        expect(formatPackaging({ totalWeightKg: 2, totalVolumeM3: 0 })).toBe('2.0 kg');
        expect(formatPackaging({ totalWeightKg: 0, totalVolumeM3: 0 })).toBeNull();
    });
});
