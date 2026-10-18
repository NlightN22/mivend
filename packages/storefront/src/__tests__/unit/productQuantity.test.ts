import { describe, expect, it } from 'vitest';
import { addQtyOf, unitViewOf } from '../../composables/productQuantity';

const pack100 = { unitName: 'box', unitRatioToBase: 100, multiplicity: 1 };
const piece = { unitName: 'pc.', unitRatioToBase: 1, multiplicity: 100 };

describe('required multiple on add to cart', () => {
    it('adds one sales-unit pack in a packages-only branch', () => {
        expect(addQtyOf(pack100, true, false)).toBe(100);
        expect(unitViewOf(pack100, true, false).step).toBe(1);
    });

    it('adds the enforced multiplicity when not packages-only', () => {
        expect(addQtyOf(piece, false, true)).toBe(100);
        expect(unitViewOf(piece, false, true).step).toBe(100);
    });

    it('adds a single piece when nothing is enforced', () => {
        expect(addQtyOf(piece, false, false)).toBe(1);
        expect(addQtyOf(undefined, false, false)).toBe(1);
    });

    it('prefers the pack over multiplicity when packages-only', () => {
        expect(addQtyOf({ ...pack100, multiplicity: 7 }, true, true)).toBe(100);
    });
});
