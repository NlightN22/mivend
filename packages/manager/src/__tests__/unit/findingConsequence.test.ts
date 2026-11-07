import { describe, expect, it } from 'vitest';
import type { CheckDefinition, CheckPolicy } from '../../api/checkPolicies';
import type { PriceAdjustmentRequestSummary } from '../../api/orderDetail';
import { consequencesByFinding } from '../../utils/findingConsequence';
import type { OrderCheckFinding } from '../../utils/orderCheckMessages';
import { summarizeFindings } from '../../utils/orderFindingsSummary';

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

    it('ignores a branch override, joining the global row only', () => {
        const rows = [policy({ branchId: 'branch-a', consequence: 'info' }), policy({ id: 'p2' })];
        expect(consequencesByFinding([finding()], [def({})], rows).get('f1')?.consequence).toBe(
            'hold',
        );
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

describe('findings summary', () => {
    const request = (status: string): PriceAdjustmentRequestSummary => ({
        id: status,
        payload: '{}',
        status,
        currentStepRole: null,
        createdAt: '2026-10-16T00:00:00Z',
        decidedAt: null,
    });

    it('counts findings, holds, pending approvals and decided approvals', () => {
        const consequences = consequencesByFinding([finding()], [def({})], [policy({})]);
        expect(
            summarizeFindings([finding(), finding({ id: 'f2', checkCode: 'x' })], consequences, [
                request('pending'),
                request('approved'),
                request('rejected'),
            ]),
        ).toEqual({ findings: 2, holding: 1, awaitingApproval: 1, handled: 2 });
    });
});
