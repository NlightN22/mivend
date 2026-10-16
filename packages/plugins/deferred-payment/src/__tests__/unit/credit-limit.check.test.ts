import { describe, expect, it } from 'vitest';

import { evaluateCreditLimit } from '../../credit-limit.check';

describe('evaluateCreditLimit', () => {
    it('reports an exceeded limit with the amounts, as one order-level warning', () => {
        expect(
            evaluateCreditLimit({
                exceeded: true,
                availableCredit: 100,
                orderAmount: 500,
                excessKopecks: 40000,
            }),
        ).toEqual([
            {
                severity: 'warning',
                messageKey: 'credit.limit.exceeded',
                facts: { availableCredit: 100, orderAmount: 500, excessKopecks: 40000 },
            },
        ]);
    });

    it('reports nothing within the limit, without a counterparty, or without limit control', () => {
        const base = { availableCredit: 800, orderAmount: 500, excessKopecks: 0 };
        expect(evaluateCreditLimit({ ...base, exceeded: false })).toEqual([]);
        expect(evaluateCreditLimit(null)).toEqual([]);
    });
});
