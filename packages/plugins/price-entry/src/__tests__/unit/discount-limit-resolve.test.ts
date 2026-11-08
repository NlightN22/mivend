import { describe, it, expect } from 'vitest';

import { resolveCeiling } from '../../discount-limit-resolve';
import { refsByScopeKind } from '../../discount-limit-scope';

const rows = [
    { scopeKind: 'all', scopeRef: '', maxDiscountPercent: 5 },
    { scopeKind: 'manufacturer', scopeRef: 'brand-a', maxDiscountPercent: 2 },
    { scopeKind: 'category', scopeRef: 'cat-a', maxDiscountPercent: 12 },
];
const refs = (manufacturerRef: string | null, categories: string[]) =>
    refsByScopeKind({
        productRef: 'p',
        manufacturerRef,
        categoryRefs: new Set(categories),
    });

describe('resolveCeiling', () => {
    it('is null (no limit) when the employee has no row that matches', () => {
        expect(resolveCeiling([], refs(null, []))).toBeNull();
        expect(resolveCeiling(rows.slice(1), refs('brand-b', ['cat-b']))).toBeNull();
        expect(resolveCeiling(rows.slice(1), refsByScopeKind(undefined))).toBeNull();
    });

    it('uses the all-products row when no narrower row matches', () => {
        expect(resolveCeiling(rows, refs('brand-b', ['cat-b']))).toBe(5);
    });

    it('lets the deepest matching percent win, not the narrowest scope', () => {
        expect(resolveCeiling(rows, refs('brand-a', []))).toBe(5);
        expect(resolveCeiling(rows, refs('brand-a', ['cat-a']))).toBe(12);
        expect(resolveCeiling(rows.slice(1), refs('brand-a', ['cat-a']))).toBe(12);
    });

    it('treats a zero limit as a limit, not as unset', () => {
        const zero = [{ scopeKind: 'all', scopeRef: '', maxDiscountPercent: 0 }];
        expect(resolveCeiling(zero, refs(null, []))).toBe(0);
    });

    it('ignores a row of a scope kind it does not know', () => {
        const odd = [{ scopeKind: 'colour', scopeRef: 'red', maxDiscountPercent: 9 }];
        expect(resolveCeiling(odd, refs(null, []))).toBeNull();
    });
});
