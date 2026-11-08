import { describe, expect, it } from 'vitest';
import { parseQuantity } from '../../components/MvQtyStepper/qtyStepperModel';

const limits = { min: 1, max: 1000, step: 1 };

describe('parseQuantity', () => {
    it('accepts a whole number inside the limits', () => {
        expect(parseQuantity('25', limits)).toEqual({ value: 25, error: null });
        expect(parseQuantity(' 7 ', limits).value).toBe(7);
    });

    it.each(['', 'abc', '-3', '1.5', '2e3', '0x10'])('rejects the text "%s"', text => {
        expect(parseQuantity(text, limits)).toEqual({
            value: null,
            error: 'Enter a whole number',
        });
    });

    it('rejects zero below the minimum and a value above the maximum', () => {
        expect(parseQuantity('0', limits).error).toBe('At least 1');
        expect(parseQuantity('1001', limits).error).toBe('At most 1000');
        expect(parseQuantity('0', { ...limits, min: 0 }).value).toBe(0);
    });

    it('requires a multiple of the pack step and names it', () => {
        const packs = { min: 4, max: 1000, step: 4 };
        expect(parseQuantity('12', packs).value).toBe(12);
        expect(parseQuantity('10', packs)).toEqual({ value: null, error: 'A multiple of 4' });
    });

    it('has no upper bound when max is not set', () => {
        expect(parseQuantity('5000000', { min: 1, step: 1 }).value).toBe(5_000_000);
    });
});
