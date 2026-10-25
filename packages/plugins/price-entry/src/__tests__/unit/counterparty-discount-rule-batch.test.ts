import { describe, expect, it } from 'vitest';

import { RuleWorkingSet, applyOps } from '../../counterparty-discount-rule-batch';
import type { CounterpartyDiscountRuleInput } from '../../counterparty-discount-rule.service';
import { DiscountRule } from '../../discount-rule.entity';

const input = (
    erpId: string,
    version: string,
    overrides: Partial<CounterpartyDiscountRuleInput> = {},
): CounterpartyDiscountRuleInput => ({
    erpId,
    recipientType: 'counterparty',
    recipientErpId: 'cp-1',
    productErpId: 'p-1',
    condition: 'byQuantity',
    conditionValue: 1,
    percent: 5,
    limitAmount: null,
    validFrom: new Date('2026-01-01'),
    validTo: null,
    sourceVersion: version,
    ...overrides,
});

const stored = (erpId: string, version: string, active = true): DiscountRule =>
    Object.assign(new DiscountRule(), {
        erpId,
        recipientType: 'counterparty',
        recipientErpId: 'cp-1',
        productErpId: 'p-1',
        sourceVersion: version,
        active,
    });

describe('applyOps (in-memory batch replay of the conflict policy)', () => {
    it('applies two versions of one entity in order and keeps the newest', () => {
        const set = new RuleWorkingSet();
        applyOps(set, [
            { kind: 'upsert', input: input('r1', '9', { percent: 1 }) },
            { kind: 'upsert', input: input('r1', '10', { percent: 2 }) },
        ]);
        expect(set.byErpId.get('r1')?.percent).toBe(2);
        expect(set.dirty).toEqual(new Set(['r1']));
    });

    it('supersedes an older active rule of the same scope', () => {
        const set = new RuleWorkingSet();
        set.add(stored('old', '1'));
        applyOps(set, [{ kind: 'upsert', input: input('new', '2') }]);
        expect(set.byErpId.get('old')?.active).toBe(false);
        expect(set.byErpId.get('new')?.active).toBe(true);
        expect(set.dirty).toEqual(new Set(['old', 'new']));
    });

    it('skips a stale event against a newer active rule without writing', () => {
        const set = new RuleWorkingSet();
        set.add(stored('cur', '5'));
        applyOps(set, [{ kind: 'upsert', input: input('late', '2') }]);
        expect(set.dirty.size).toBe(0);
        expect(set.byErpId.has('late')).toBe(false);
    });

    it('writes inactive next to a portal-sourced rule and leaves it untouched', () => {
        const set = new RuleWorkingSet();
        set.add(stored('portal-1', '1'));
        applyOps(set, [{ kind: 'upsert', input: input('erp-1', '2') }]);
        expect(set.byErpId.get('erp-1')?.active).toBe(false);
        expect(set.byErpId.get('portal-1')?.active).toBe(true);
    });

    it('does not reactivate a deactivated row with a non-newer version', () => {
        const set = new RuleWorkingSet();
        set.add(stored('r1', '5', false));
        applyOps(set, [{ kind: 'upsert', input: input('r1', '5') }]);
        expect(set.dirty.size).toBe(0);
    });

    it('tombstone deactivates a known rule, stores the version and reports unknown ones', () => {
        const set = new RuleWorkingSet();
        set.add(stored('r1', '1'));
        const matched = applyOps(set, [
            { kind: 'tombstone', erpId: 'r1', version: '7' },
            { kind: 'tombstone', erpId: 'ghost', version: '7' },
        ]);
        expect(matched).toEqual([true, false]);
        expect(set.byErpId.get('r1')).toMatchObject({ active: false, sourceVersion: '7' });
    });

    it('a rule created earlier in the batch is seen by a later conflicting op', () => {
        const set = new RuleWorkingSet();
        applyOps(set, [
            { kind: 'upsert', input: input('a', '1') },
            { kind: 'upsert', input: input('b', '2') },
        ]);
        expect(set.byErpId.get('a')?.active).toBe(false);
        expect(set.byErpId.get('b')?.active).toBe(true);
    });
});
