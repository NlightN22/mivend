import { describe, expect, it } from 'vitest';

import { toAlphaCurrency } from '../../currency-code';

describe('toAlphaCurrency', () => {
    it('maps the ISO numeric code the ERP sends to the alphabetic code', () => {
        expect(toAlphaCurrency('643')).toBe('RUB');
        expect(toAlphaCurrency('840')).toBe('USD');
    });

    it('keeps an alphabetic code and normalizes its case', () => {
        expect(toAlphaCurrency('rub')).toBe('RUB');
        expect(toAlphaCurrency('EUR')).toBe('EUR');
    });

    it('returns an unknown code unchanged instead of failing', () => {
        expect(toAlphaCurrency('999')).toBe('999');
    });
});
