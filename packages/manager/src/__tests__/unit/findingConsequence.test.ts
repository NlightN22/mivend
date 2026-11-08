import { describe, expect, it } from 'vitest';
import type { CheckDefinition, CheckPolicy } from '../../api/checkPolicies';
import { consequencesByFinding } from '../../utils/findingConsequence';
import type { OrderCheckFinding } from '../../utils/orderCheckMessages';

const def = (over: Partial<CheckDefinition>): CheckDefinition => ({
    code: 'erp.organization-stock',
    subjectType: 'order',
    stages: ['pre-reserve'],
    description: '',
    defaultConsequence: 'warn',
    allowedConsequences: ['info', 'warn', 'hold'],
    stageConsequences: null,
    stageDefaults: null,
    defaultEnabled: true,
    ...over,
});

const policy = (over: Partial<CheckPolicy>): CheckPolicy => ({
    id: 'p1',
    checkCode: 'erp.organization-stock',
    stage: 'pre-reserve',
    branchId: null,
    consequence: 'hold',
    recipient: null,
    enabled: true,
    ...over,
});

const finding = (over: Partial<OrderCheckFinding> = {}): OrderCheckFinding => ({
    id: 'f1',
    checkCode: 'erp.organization-stock',
    stage: 'pre-reserve',
    lineRef: 'l1',
    severity: 'error',
    messageKey: 'erp.organization-stock.short',
    facts: {},
    computedAt: '2026-10-16T00:00:00Z',
    stale: false,
    ...over,
});

describe('finding consequence join', () => {
    it('takes the stored policy and marks a hold as stopping automatic confirmation', () => {
        const result = consequencesByFinding([finding()], [def({})], [policy({})]);
        expect(result.get('f1')).toMatchObject({ consequence: 'hold', holdsConfirmation: true });
    });

    it('falls back to the declared default when no policy row is readable', () => {
        const result = consequencesByFinding([finding()], [def({})], []);
        expect(result.get('f1')).toMatchObject({ consequence: 'warn', holdsConfirmation: false });
    });

    it('uses the stage default before the check default', () => {
        const d = def({ stageDefaults: { 'pre-reserve': 'info' } });
        expect(consequencesByFinding([finding()], [d], []).get('f1')?.consequence).toBe('info');
    });

    it('lets a branch row override the global row for an order of that branch', () => {
        const rows = [policy({ branchId: 'branch-a', consequence: 'info' }), policy({ id: 'p2' })];
        const of = (branch: string | null): string | undefined =>
            consequencesByFinding([finding()], [def({})], rows, branch).get('f1')?.consequence;
        expect(of('branch-a')).toBe('info');
        expect(of('branch-b')).toBe('hold');
        expect(of(null)).toBe('hold');
    });

    it('lets a branch row turn the check off for that branch only', () => {
        const rows = [policy({ branchId: 'branch-a', enabled: false }), policy({ id: 'p2' })];
        const of = (branch: string): boolean =>
            consequencesByFinding([finding()], [def({})], rows, branch).has('f1');
        expect([of('branch-a'), of('branch-b')]).toEqual([false, true]);
    });

    it('leaves a finding without a consequence when its check is disabled or unknown', () => {
        const off = consequencesByFinding([finding()], [def({})], [policy({ enabled: false })]);
        const unknown = consequencesByFinding([finding({ checkCode: 'gone' })], [def({})], []);
        expect(off.has('f1')).toBe(false);
        expect(unknown.has('f1')).toBe(false);
    });

    it('matches a finding without a stage to the check', () => {
        const result = consequencesByFinding([finding({ stage: null })], [def({})], [policy({})]);
        expect(result.get('f1')?.consequence).toBe('hold');
    });
});

describe('holding consequences', () => {
    it('holds confirmation for exactly the hold, block and require-approval consequences', () => {
        const held = (consequence: string): boolean => {
            const map = consequencesByFinding([finding()], [def({})], [policy({ consequence })]);
            return map.get('f1')?.holdsConfirmation ?? false;
        };
        expect(['info', 'warn', 'hold', 'block', 'require-approval'].map(held)).toEqual([
            false,
            false,
            true,
            true,
            true,
        ]);
    });
});
