import { describe, expect, it } from 'vitest';

import { stockVariantFromLevel, stockVariantFromQuantity } from './stock-variant';

describe('stockVariantFromLevel', () => {
    it.each([
        ['OUT_OF_STOCK', 'out'],
        ['LOW_STOCK', 'low'],
        ['MEDIUM_STOCK', 'medium'],
        ['HIGH_STOCK', 'high'],
    ])('maps %s to %s', (level, variant) => {
        expect(stockVariantFromLevel(level)).toBe(variant);
    });

    it('treats a missing or unknown level as out (never shows stock that is not confirmed)', () => {
        expect(stockVariantFromLevel(undefined)).toBe('out');
        expect(stockVariantFromLevel('')).toBe('out');
        expect(stockVariantFromLevel('IN_STOCK')).toBe('out');
    });
});

describe('stockVariantFromQuantity', () => {
    it.each([
        [0, 'out'],
        [1, 'low'],
        [4, 'low'],
        [5, 'medium'],
        [19, 'medium'],
        [20, 'high'],
    ])('maps %i to %s (docs/order-flow.md tiers)', (qty, variant) => {
        expect(stockVariantFromQuantity(qty)).toBe(variant);
    });
});
