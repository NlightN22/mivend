import { describe, expect, it } from 'vitest';
import type { FindingConsequence } from '../../utils/findingConsequence';
import type { OrderCheckFinding } from '../../utils/orderCheckMessages';
import { toDocFlag } from '../../utils/orderDocFlags';
import type { CellProblem } from '../../utils/orderLineProblems';

const finding = { id: 'f1', messageKey: 'x.y', checkCode: 'c' } as unknown as OrderCheckFinding;
const problem = (tone: CellProblem['tone'], findings: OrderCheckFinding[] = []): CellProblem => ({
    tone,
    findings,
    notes: ['Requires approval'],
});
const consequence = (c: string): Map<string, FindingConsequence> =>
    new Map([['f1', { consequence: c, label: 'Label', variant: 'danger' } as FindingConsequence]]);

describe('toDocFlag', () => {
    it('keeps tone, lists notes before findings and carries the consequence badge', () => {
        const flag = toDocFlag(problem('orange', [finding]), {
            consequences: consequence('require-approval'),
            canConfirm: true,
            canReject: true,
        });
        expect(flag.tone).toBe('orange');
        expect(flag.notes[0].text).toBe('Requires approval');
        expect(flag.notes[1].badge).toEqual({ label: 'Label', variant: 'danger' });
    });

    it('offers confirm only when allowed and not blocked, reject when allowed', () => {
        const actions = (c: string, canConfirm: boolean, canReject: boolean): string[] =>
            toDocFlag(problem('danger', [finding]), {
                consequences: consequence(c),
                canConfirm,
                canReject,
            }).actions!.map(a => a.key);
        expect(actions('warn', true, true)).toEqual(['confirm', 'reject']);
        expect(actions('block', true, true)).toEqual(['reject']);
        expect(actions('warn', false, false)).toEqual([]);
    });
});
