import { describe, expect, it } from 'vitest';

import { planPolicyRows, type BranchFlags } from '../../migration-helpers/branch-toggles.plan';

const branch = (branchId: string, multiplicity: boolean, exceeding: boolean): BranchFlags => ({
    branchId,
    multiplicity,
    exceeding,
});
const key = (r: { code: string; stage: string; branchId: string | null }): string =>
    `${r.code}:${r.stage}:${r.branchId ?? 'global'}`;

describe('planPolicyRows', () => {
    it('writes the default branch flags as the global rows and an override only where a branch differs', () => {
        const dflt = branch('b-default', true, false);
        const plan = planPolicyRows(dflt, [
            dflt,
            branch('b-1', false, false),
            branch('b-2', true, true),
        ]);
        const byKey = new Map(plan.map(r => [key(r), r]));
        expect(byKey.get('order.multiplicity:cart:global')).toMatchObject({
            consequence: 'block',
            enabled: true,
        });
        expect(byKey.get('credit.limit:checkout:global')).toMatchObject({
            consequence: 'hold',
            enabled: true,
        });
        expect(byKey.get('order.multiplicity:cart:b-1')).toMatchObject({ enabled: false });
        expect(byKey.has('credit.limit:checkout:b-1')).toBe(false);
        expect(byKey.get('credit.limit:checkout:b-2')).toMatchObject({ consequence: 'warn' });
        expect(byKey.has('order.multiplicity:cart:b-2')).toBe(false);
        expect([...byKey.keys()].filter(k => k.endsWith(':b-default'))).toEqual([]);
    });

    it('without a default branch the global rows are the old defaults: multiplicity off, over-limit orders hold', () => {
        const plan = planPolicyRows(null, [branch('b-1', true, true)]);
        const global = plan.filter(r => r.branchId === null);
        expect(global.filter(r => r.code === 'order.multiplicity').every(r => !r.enabled)).toBe(
            true,
        );
        expect(
            global.find(r => r.code === 'credit.limit' && r.stage === 'checkout')?.consequence,
        ).toBe('hold');
        expect(plan.filter(r => r.branchId === 'b-1').length).toBeGreaterThan(0);
    });
});
