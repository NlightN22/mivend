import { describe, expect, it } from 'vitest';
import { fitChips } from '../../utils/chipsFit';

describe('fitChips', () => {
    it('shows everything when two rows are enough', () => {
        const fit = fitChips([100, 100, 100], 0, 320, 8, 60);
        expect(fit.overflows).toBe(false);
        expect(fit.visible).toEqual([true, true, true]);
    });

    it('hides the tail and keeps room for the toggle', () => {
        const fit = fitChips([100, 100, 100, 100, 100], 0, 220, 8, 60);
        expect(fit.overflows).toBe(true);
        expect(fit.visible).toEqual([true, true, true, false, false]);
    });

    it('keeps the active chip visible in its own position', () => {
        const fit = fitChips([100, 100, 100, 100, 100], 4, 220, 8, 60);
        expect(fit.visible[4]).toBe(true);
        expect(fit.visible.filter(Boolean).length).toBeLessThan(5);
    });
});
