import { describe, it, expect } from 'vitest';

import { resolveCeiling } from '../../discount-limit-resolve';

const rows = [
    { roleCode: 'manager', groupRef: '', maxDiscountPercent: 5 },
    { roleCode: 'manager', groupRef: 'brand-a', maxDiscountPercent: 2 },
    { roleCode: 'head', groupRef: '', maxDiscountPercent: 10 },
];

describe('resolveCeiling', () => {
    it('is null (no limit) when no row covers the roles', () => {
        expect(resolveCeiling([], ['manager'], new Set())).toBeNull();
        expect(resolveCeiling(rows, ['operator'], new Set())).toBeNull();
        expect(resolveCeiling(rows, [], new Set())).toBeNull();
    });

    it('uses the all-products row when the product is in no limited group', () => {
        expect(resolveCeiling(rows, ['manager'], new Set(['brand-b']))).toBe(5);
    });

    it('lets a matching group row beat the all-products row of the same role', () => {
        expect(resolveCeiling(rows, ['manager'], new Set(['brand-a']))).toBe(2);
    });

    it('takes the most permissive limit across roles', () => {
        expect(resolveCeiling(rows, ['manager', 'head'], new Set(['brand-a']))).toBe(10);
        expect(resolveCeiling(rows, ['manager', 'operator'], new Set())).toBe(5);
    });

    it('treats a zero limit as a limit, not as unset', () => {
        const zero = [{ roleCode: 'manager', groupRef: '', maxDiscountPercent: 0 }];
        expect(resolveCeiling(zero, ['manager'], new Set())).toBe(0);
    });
});
