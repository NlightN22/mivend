import { describe, expect, it } from 'vitest';

import { clampSearchLimit, normalizeSearchTerm } from '../../search-term';

describe('normalizeSearchTerm', () => {
    it('trims and keeps the case', () => {
        expect(normalizeSearchTerm('  AbC ')).toBe('AbC');
    });

    it.each(['', ' ', 'a', ' a '])('treats %j as too short', term => {
        expect(normalizeSearchTerm(term)).toBeNull();
    });

    it('accepts two characters and Cyrillic', () => {
        expect(normalizeSearchTerm('ро')).toBe('ро');
    });

    it('rejects an over-long term', () => {
        expect(() => normalizeSearchTerm('x'.repeat(65))).toThrow('Invalid search term');
    });
});

describe('clampSearchLimit', () => {
    it.each([
        [undefined, 5],
        [null, 5],
        [0, 1],
        [-3, 1],
        [3, 3],
        [10, 10],
        [99, 10],
        [2.9, 2],
    ])('%j -> %j', (input, expected) => {
        expect(clampSearchLimit(input)).toBe(expected);
    });
});
