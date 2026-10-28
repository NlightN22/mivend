import { describe, expect, it } from 'vitest';

import { bestSetupPercent } from '../../discount-setup-evaluation';
import type { LoadedDiscountSetup, SetupEvaluation } from '../../discount-setup-evaluation';

const rule = (overrides: Partial<LoadedDiscountSetup> = {}): LoadedDiscountSetup => ({
    id: 1,
    percent: 5,
    allProducts: false,
    productMode: 'list',
    metric: null,
    conditionNumber: null,
    ...overrides,
});

function evaluate(overrides: Partial<SetupEvaluation>): number | null {
    return bestSetupPercent({
        rules: [],
        membersBySetup: new Map(),
        productErpId: 'p1',
        quantityByProductErpId: new Map(),
        documentAmount: 0,
        ...overrides,
    });
}

describe('bestSetupPercent', () => {
    it('matches an unconditional all-products setup for any product', () => {
        expect(evaluate({ rules: [rule({ allProducts: true })] })).toBe(5);
        expect(evaluate({ rules: [rule({ allProducts: true })], productErpId: null })).toBe(5);
    });

    it('treats the unconditional metric like an empty condition, whatever the threshold', () => {
        const rules = [rule({ allProducts: true, metric: 'unconditional', conditionNumber: 50 })];
        expect(evaluate({ rules })).toBe(5);
    });

    it('matches a list setup only for a member product', () => {
        const rules = [rule()];
        expect(evaluate({ rules, membersBySetup: new Map([[1, new Set(['p1'])]]) })).toBe(5);
        expect(evaluate({ rules, membersBySetup: new Map([[1, new Set(['p2'])]]) })).toBeNull();
        expect(evaluate({ rules, productErpId: null })).toBeNull();
    });

    it('sums the quantity over the products of the list, not over the whole order', () => {
        const rules = [rule({ metric: 'quantity', conditionNumber: 10 })];
        const membersBySetup = new Map([[1, new Set(['p1', 'p2'])]]);
        const quantityByProductErpId = new Map([
            ['p1', 6],
            ['p2', 3],
            ['other', 50],
        ]);
        expect(evaluate({ rules, membersBySetup, quantityByProductErpId })).toBeNull();
        quantityByProductErpId.set('p2', 4);
        expect(evaluate({ rules, membersBySetup, quantityByProductErpId })).toBe(5);
    });

    it('sums the quantity over the whole order for an all-products setup', () => {
        const rules = [rule({ allProducts: true, metric: 'quantity', conditionNumber: 10 })];
        const quantityByProductErpId = new Map([
            ['p1', 4],
            ['other', 6],
        ]);
        expect(evaluate({ rules, quantityByProductErpId })).toBe(5);
    });

    it('compares the document amount in kopecks with a threshold in currency units', () => {
        const rules = [rule({ allProducts: true, metric: 'amount', conditionNumber: 100 })];
        expect(evaluate({ rules, documentAmount: 9999 })).toBeNull();
        expect(evaluate({ rules, documentAmount: 10000 })).toBe(5);
    });

    it('treats a missing threshold as zero so a catalog without an order still matches', () => {
        const rules = [rule({ allProducts: true, metric: 'quantity', conditionNumber: null })];
        expect(evaluate({ rules })).toBe(5);
    });

    it('takes the highest percent and never stacks; a markup competes by max', () => {
        const rules = [
            rule({ id: 1, allProducts: true, percent: -5 }),
            rule({ id: 2, allProducts: true, percent: 3 }),
            rule({ id: 3, allProducts: true, percent: 2 }),
        ];
        expect(evaluate({ rules })).toBe(3);
        expect(evaluate({ rules: [rules[0]] })).toBe(-5);
    });
});
