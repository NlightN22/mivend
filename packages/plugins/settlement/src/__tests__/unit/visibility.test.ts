import { describe, expect, it } from 'vitest';

import {
    KNOWN_CATEGORIES,
    customerHiddenSql,
    customerVisibleSql,
    normalizeCategory,
} from '../../settlement-visibility';

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

describe('customerVisibleSql', () => {
    const sql = customerVisibleSql('d', 't');

    it('hides only an explicit false flag and ignores the type reference visibility', () => {
        expect(sql).toContain(
            `COALESCE("d"."accounting"->>'reflectedInAccounting', 'true') <> 'false'`,
        );
        expect(sql).not.toContain('customerVisible');
    });

    it('keeps purchase and payroll categories internal', () => {
        expect(sql).toContain(`NOT IN ('supplier', 'payroll')`);
    });
});

describe('customerHiddenSql', () => {
    it('is exactly the negation of the visible predicate', () => {
        expect(customerHiddenSql('d', 't')).toBe(`(NOT ${customerVisibleSql('d', 't')})`);
    });
});
