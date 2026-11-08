import { describe, expect, it } from 'vitest';
import {
    capHint,
    percentFromPrice,
    priceFromPercent,
    referencePrice,
} from '../../utils/lineValueModel';

describe('referencePrice', () => {
    it('recovers the base price from the effective price and the server percent', () => {
        expect(referencePrice(15300, 10, 17000)).toBe(17000);
    });

    it('falls back to the list price without a server percent or at 100%', () => {
        expect(referencePrice(0, 100, 17000)).toBe(17000);
        expect(referencePrice(15300, null, 17000)).toBe(17000);
    });
});

describe('price and percent conversion', () => {
    it('turns a percent into a unit price with cent rounding', () => {
        expect(priceFromPercent(17000, '10')).toBe('153.00');
        expect(priceFromPercent(10001, '33.33')).toBe('66.68');
    });

    it('treats a negative percent as a surcharge', () => {
        expect(priceFromPercent(10000, '-5')).toBe('105.00');
        expect(percentFromPrice(10000, '105')).toBe('-5');
    });

    it('turns a price into a percent rounded to 2 decimals', () => {
        expect(percentFromPrice(17000, '119')).toBe('30');
        expect(percentFromPrice(30000, '100')).toBe('66.67');
    });

    it('returns null for empty, invalid or reference-less input', () => {
        expect(priceFromPercent(17000, '')).toBeNull();
        expect(percentFromPrice(17000, 'abc')).toBeNull();
        expect(percentFromPrice(0, '10')).toBeNull();
    });
});

describe('capHint', () => {
    it('shows nothing when the ceiling is unknown', () => {
        expect(capHint('30', 17000, 11900, null).kind).toBe('none');
    });

    it('flags a deepening beyond the limit as needing approval', () => {
        const hint = capHint('30', 17000, 11900, 10);
        expect(hint.kind).toBe('approval');
        expect(hint.text).toContain('10%');
    });

    it('only states the limit when the discount is within it', () => {
        expect(capHint('5', 17000, 16150, 10).kind).toBe('limit');
    });

    it('never gates a reduction, even if the percent stays above the limit', () => {
        expect(capHint('30', 11900, 15300, 10).kind).toBe('limit');
    });
});
