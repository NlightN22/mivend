import { describe, expect, it } from 'vitest';

import { KNOWN_CATEGORIES, normalizeCategory } from '../../settlement-visibility';

describe('normalizeCategory', () => {
    it('keeps every known category', () => {
        for (const category of KNOWN_CATEGORIES) {
            expect(normalizeCategory(category)).toBe(category);
        }
    });

    it('maps an unknown, empty or missing category to other', () => {
        expect(normalizeCategory('brand-new')).toBe('other');
        expect(normalizeCategory('')).toBe('other');
        expect(normalizeCategory(null)).toBe('other');
        expect(normalizeCategory(undefined)).toBe('other');
    });
});
