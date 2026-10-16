import { describe, it, expect } from 'vitest';
import { buildPolicyRows, isRowDirty } from '../../utils/checkPolicyRows';

const defs = [
    {
        code: 'erp.organization-stock',
        stages: ['pre-reserve', 'pre-send-to-erp'],
        description: 'd',
        defaultConsequence: 'warn',
        allowedConsequences: ['info', 'warn', 'hold'],
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
});
