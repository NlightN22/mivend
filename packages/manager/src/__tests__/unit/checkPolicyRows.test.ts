import { describe, it, expect } from 'vitest';
import { buildPolicyRows, isRowDirty, policyCaption } from '../../utils/checkPolicyRows';

const defs = [
    {
        code: 'erp.organization-stock',
        stages: ['pre-reserve', 'pre-send-to-erp'],
        description: 'd',
        defaultConsequence: 'warn',
        allowedConsequences: ['info', 'warn', 'hold'],
        stageConsequences: null,
        stageDefaults: null,
        defaultEnabled: true,
    },
];

describe('buildPolicyRows', () => {
    it('creates one row per check and stage, using defaults when no policy is stored', () => {
        const rows = buildPolicyRows(defs, []);
        expect(rows.map(r => r.key)).toEqual([
            'erp.organization-stock:pre-reserve',
            'erp.organization-stock:pre-send-to-erp',
        ]);
        expect(rows[0]).toMatchObject({ consequence: 'warn', enabled: true, recipient: '' });
        expect(rows[0].allowedConsequences).toEqual(['info', 'warn', 'hold']);
    });

    it('uses the stored policy and reports dirty only after an edit', () => {
        const [row] = buildPolicyRows(defs, [
            {
                id: '1',
                checkCode: 'erp.organization-stock',
                stage: 'pre-reserve',
                branchId: null,
                consequence: 'hold',
                recipient: 'head',
                enabled: false,
            },
        ]);
        expect(row).toMatchObject({ consequence: 'hold', recipient: 'head', enabled: false });
        expect(isRowDirty(row)).toBe(false);
        row.consequence = 'warn';
        expect(isRowDirty(row)).toBe(true);
    });

    it('takes the per-stage default consequence, enablement and the stage-only consequence', () => {
        const rows = buildPolicyRows(
            [
                {
                    ...defs[0],
                    code: 'order.multiplicity',
                    stages: ['cart', 'on-edit'],
                    stageConsequences: { cart: ['block'] },
                    stageDefaults: { cart: 'block', 'on-edit': 'warn' },
                    defaultEnabled: { cart: false },
                },
            ],
            [],
        );
        expect(rows.map(r => [r.stage, r.consequence, r.enabled])).toEqual([
            ['cart', 'block', false],
            ['on-edit', 'warn', true],
        ]);
        expect(rows[0].allowedConsequences).toEqual(['info', 'warn', 'hold', 'block']);
        expect(rows[1].allowedConsequences).toEqual(['info', 'warn', 'hold']);
    });

    it('shows a branch override over the global row, and marks a row without one as inherited', () => {
        const policy = (branchId: string | null, consequence: string) => ({
            id: `${branchId}`,
            checkCode: 'erp.organization-stock',
            stage: 'pre-reserve',
            branchId,
            consequence,
            recipient: null,
            enabled: true,
        });
        const policies = [policy(null, 'hold'), policy('b1', 'info')];
        const [own] = buildPolicyRows(defs, policies, 'b1');
        expect(own).toMatchObject({ branchId: 'b1', inherited: false, consequence: 'info' });
        const [other] = buildPolicyRows(defs, policies, 'b2');
        expect(other).toMatchObject({ branchId: 'b2', inherited: true, consequence: 'hold' });
        const [global] = buildPolicyRows(defs, policies, null);
        expect(global).toMatchObject({ branchId: null, inherited: false, consequence: 'hold' });
    });

    it('explains the credit limit checkout policy, which routes placement, and nothing else', () => {
        const row = { checkCode: 'credit.limit', stage: 'checkout', consequence: 'hold' };
        expect(policyCaption(row)).toContain('waits for manager confirmation');
        expect(policyCaption({ ...row, consequence: 'warn' })).toContain('acknowledges');
        expect(policyCaption({ ...row, stage: 'on-edit' })).toBeNull();
        expect(policyCaption({ ...row, checkCode: 'order.multiplicity' })).toBeNull();
    });
});
