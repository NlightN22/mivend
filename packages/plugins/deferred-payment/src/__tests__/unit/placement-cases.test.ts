import { describe, expect, it } from 'vitest';

import { PLACEMENT_CASES, placementCaseCode } from '../../placement-cases';
import { evaluatePlacementCase } from '../../placement-confirmation.check';
import { decidePlacement } from '../../placement-policy';

const base = {
    form: 'cash' as const,
    limitControlled: true,
    exceeded: false,
    allowExceeding: false,
    acknowledged: false,
};

describe('placement cases table', () => {
    it('holds the eight distinct cases with stable codes', () => {
        expect(PLACEMENT_CASES).toHaveLength(8);
        expect(new Set(PLACEMENT_CASES.map(c => c.code)).size).toBe(8);
        for (const c of PLACEMENT_CASES) expect(placementCaseCode(c)).toBe(c.code);
        expect(PLACEMENT_CASES.map(c => c.code)).toContain(
            'payment.confirmation.cash.pickup.deferred',
        );
    });

    it('yields a finding only for the case the order falls into', () => {
        const [own, other] = PLACEMENT_CASES;
        expect(evaluatePlacementCase(own, own)).toHaveLength(1);
        expect(evaluatePlacementCase(own, other)).toEqual([]);
        expect(evaluatePlacementCase(own, undefined)).toEqual([]);
        expect(evaluatePlacementCase(own, null)).toEqual([]);
    });
});

describe('decidePlacement layers', () => {
    it('keeps today behaviour without a matrix hold', () => {
        expect(decidePlacement(base).route).toBe('erp-now');
        expect(decidePlacement({ ...base, confirmationHold: false }).route).toBe('erp-now');
    });

    it('sends a matrix hold to a manager when the limit is not exceeded', () => {
        const d = decidePlacement({ ...base, confirmationHold: true });
        expect(d).toMatchObject({ route: 'manager-confirmation', creditLimitExceeded: false });
    });

    it('lets the exceeded limit decide over the matrix', () => {
        const d = decidePlacement({
            ...base,
            exceeded: true,
            allowExceeding: true,
            acknowledged: true,
            confirmationHold: true,
        });
        expect(d).toMatchObject({ route: 'erp-now', creditLimitExceeded: true });
    });

    it('ignores the matrix for a card payment', () => {
        expect(decidePlacement({ ...base, form: 'card', confirmationHold: true }).route).toBe(
            'after-payment',
        );
    });
});
