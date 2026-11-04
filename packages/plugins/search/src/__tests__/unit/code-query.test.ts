import { describe, expect, it } from 'vitest';

import { extractCodes, normalizeCode, skuMatchReasons } from '../../code-query';

describe('normalizeCode', () => {
    it('lower-cases and strips . - / _ and spaces', () => {
        expect(normalizeCode('48.3855')).toBe('483855');
        expect(normalizeCode('AB-12/3_4 5')).toBe('ab12345');
    });
});

describe('extractCodes', () => {
    it('takes digit-bearing tokens only and normalizes them', () => {
        expect(extractCodes('48.3855')).toEqual(['483855']);
        expect(extractCodes('48.3855 filter')).toEqual(['483855']);
        expect(extractCodes('E2E-OIL-001')).toEqual(['e2eoil001']);
    });

    it('returns nothing for a pure-text query', () => {
        expect(extractCodes('oil filter')).toEqual([]);
        expect(extractCodes('')).toEqual([]);
    });

    it('rejects tokens with other characters and de-duplicates', () => {
        expect(extractCodes('a#1 12/3 123')).toEqual(['123']);
    });
});

describe('skuMatchReasons', () => {
    it('distinguishes exact, separator-insensitive and prefix hits', () => {
        expect(skuMatchReasons('AB-1', ['ab-1'])).toEqual(['exactSku']);
        expect(skuMatchReasons('48.3855', ['483855'])).toEqual(['exactNormalizedSku']);
        expect(skuMatchReasons('48.3855X', ['483855'])).toEqual(['prefixSku']);
        expect(skuMatchReasons('XYZ', ['483855'])).toEqual([]);
    });
});
