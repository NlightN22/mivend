import { describe, it, expect } from 'vitest';

import { stockTierFor } from '../../stock-tier';

describe('stockTierFor', () => {
    const thresholds = { lowMax: 4, mediumMax: 19 };

    it.each([
        [-3, 'OUT_OF_STOCK'],
        [0, 'OUT_OF_STOCK'],
        [1, 'LOW_STOCK'],
        [4, 'LOW_STOCK'],
        [5, 'MEDIUM_STOCK'],
        [19, 'MEDIUM_STOCK'],
        [20, 'HIGH_STOCK'],
        [5000, 'HIGH_STOCK'],
    ])('maps ATP %i to %s with the documented 0 / 1-4 / 5-19 / 20+ tiers', (atp, tier) => {
        expect(stockTierFor(atp, thresholds)).toBe(tier);
    });

    it('honours custom thresholds', () => {
        expect(stockTierFor(10, { lowMax: 9, mediumMax: 50 })).toBe('MEDIUM_STOCK');
    });

    describe('variant sold in packs (ratio 50)', () => {
        it.each([
            [20, 'OUT_OF_STOCK'],
            [49, 'OUT_OF_STOCK'],
            [50, 'LOW_STOCK'],
            [99, 'LOW_STOCK'],
            [100, 'LOW_STOCK'],
            [250, 'MEDIUM_STOCK'],
            [1000, 'HIGH_STOCK'],
        ])('maps %i base units to %s by whole packs', (atp, tier) => {
            expect(stockTierFor(atp, thresholds, 50)).toBe(tier);
        });

        it('applies the thresholds to packs, not base units', () => {
            expect(stockTierFor(99, { lowMax: 0, mediumMax: 1 }, 50)).toBe('MEDIUM_STOCK');
            expect(stockTierFor(100, { lowMax: 0, mediumMax: 1 }, 50)).toBe('HIGH_STOCK');
        });
    });

    it.each([null, 1, 0.5])('keeps base units for pack ratio %s', ratio => {
        expect(stockTierFor(3, thresholds, ratio)).toBe('LOW_STOCK');
    });
});
