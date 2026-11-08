import { describe, expect, it } from 'vitest';
import { decreaseDisabled, parseQuantity } from '../../components/MvQtyStepper/qtyStepperModel';

const limits = { min: 1, max: 1000, step: 1 };

describe('parseQuantity', () => {
    it('accepts a whole number inside the limits', () => {
        expect(parseQuantity('25', limits)).toEqual({ value: 25, error: null });
        expect(parseQuantity(' 7 ', limits).value).toBe(7);
    });

    it.each(['', 'abc', '-3', '1.5', '2e3', '0x10'])('rejects the text "%s"', text => {
        expect(parseQuantity(text, limits)).toEqual({ value: null, error: 'whole' });
    });

    it('rejects zero below the minimum and a value above the maximum', () => {
        expect(parseQuantity('0', limits).error).toBe('min');
        expect(parseQuantity('1001', limits).error).toBe('max');
        expect(parseQuantity('0', { ...limits, min: 0 }).value).toBe(0);
    });

    it('requires a multiple of the pack step and names it', () => {
        const packs = { min: 4, max: 1000, step: 4 };
        expect(parseQuantity('12', packs).value).toBe(12);
        expect(parseQuantity('10', packs)).toEqual({ value: null, error: 'multiple' });
    });

    it('has no upper bound when max is not set', () => {
        expect(parseQuantity('5000000', { min: 1, step: 1 }).value).toBe(5_000_000);
    });
});

describe('decreaseDisabled', () => {
    const packs = { min: 1, step: 4 };

    it('keeps the original rule in confirm mode, so a step above the minimum still clamps', () => {
        expect(decreaseDisabled(3, packs, false)).toBe(false);
        expect(decreaseDisabled(1, packs, false)).toBe(true);
    });

    it('also disables a step that would land below the minimum in live mode', () => {
        expect(decreaseDisabled(3, packs, true)).toBe(true);
        expect(decreaseDisabled(5, packs, true)).toBe(false);
    });
});
