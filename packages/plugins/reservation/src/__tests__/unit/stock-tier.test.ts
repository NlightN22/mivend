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
});
