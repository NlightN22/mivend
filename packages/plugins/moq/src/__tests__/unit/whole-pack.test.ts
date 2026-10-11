import { describe, expect, it } from 'vitest';

import { wholePackQuantity, wholePacks } from '../../whole-pack';

describe('whole pack helpers', () => {
    it('finds the smallest whole base quantity of whole packs', () => {
        expect(wholePackQuantity(6)).toBe(6);
        expect(wholePackQuantity(0.9)).toBe(9);
        expect(wholePackQuantity(2.5)).toBe(5);
    });

    it('returns null when no whole multiple exists within the search bound', () => {
        expect(wholePackQuantity(Math.PI)).toBeNull();
    });

    it('converts a base quantity to packs only when it is a whole number of packs', () => {
        expect(wholePacks(18, 6)).toBe(3);
        expect(wholePacks(9, 0.9)).toBe(10);
        expect(wholePacks(1, 0.9)).toBeNull();
    });
});
