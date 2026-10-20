import { describe, expect, it } from 'vitest';

import {
    contractAlmostExhausted,
    contractDebtMinor,
    dueTotals,
    isOverdue,
    nextPayment,
    orderIdOf,
    overdueTotals,
    restrictions,
    type UnpaidDoc,
} from '../pages/account/balanceView';
import { isLimitAlmostExhausted, usedPercent } from '../utils/creditLimit';

const doc = (patch: Partial<UnpaidDoc>): UnpaidDoc => ({
    id: '1',
    currency: 'RUB',
    amount: 1000,
    openAmount: null,
    dueDate: null,
    orders: [],
    ...patch,
});

describe('balance view', () => {
    it('sums what is still owed per currency, falling back to the amount', () => {
        expect(
            dueTotals([
                doc({ amount: 1000, openAmount: 400 }),
                doc({ amount: 300 }),
                doc({ currency: 'USD', amount: 50 }),
            ]),
        ).toEqual([
            { currency: 'RUB', minor: 700 },
            { currency: 'USD', minor: 50 },
        ]);
    });

    it('sums overdue per currency and drops zero totals', () => {
        expect(
            overdueTotals([
                { currency: 'RUB', currentBalance: 0, overdue: 100 },
                { currency: 'RUB', currentBalance: 0, overdue: 50 },
                { currency: 'USD', currentBalance: 0, overdue: 0 },
            ]),
        ).toEqual([{ currency: 'RUB', minor: 150 }]);
    });

    it('picks the earliest due date as the next payment and ignores undated documents', () => {
        const docs = [
            doc({ id: 'a', dueDate: '2026-11-10' }),
            doc({ id: 'b' }),
            doc({ id: 'c', dueDate: '2026-11-01' }),
        ];
        expect(nextPayment(docs)?.id).toBe('c');
        expect(nextPayment([doc({})])).toBeNull();
    });

    it('marks a document overdue only when its due date has passed', () => {
        const now = new Date('2026-10-20T12:00:00Z');
        expect(isOverdue(doc({ dueDate: '2026-10-19T00:00:00Z' }), now)).toBe(true);
        expect(isOverdue(doc({ dueDate: '2026-10-21T00:00:00Z' }), now)).toBe(false);
        expect(isOverdue(doc({}), now)).toBe(false);
    });

    it('links only an order the customer can see', () => {
        expect(orderIdOf(doc({ orders: [{ orderId: null }, { orderId: '9' }] }))).toBe('9');
        expect(orderIdOf(doc({ orders: [{ orderId: null }] }))).toBeNull();
    });

    it('takes the contract debt from its own balances only', () => {
        const balances = [
            { contractId: '1', currency: 'RUB', currentBalance: 85000, overdue: 0 },
            { contractId: '2', currency: 'RUB', currentBalance: 99999, overdue: 0 },
        ];
        expect(contractDebtMinor('1', balances)).toBe(85000);
        expect(contractAlmostExhausted({ id: '1', creditLimit: 1000 }, balances)).toBe(true);
        expect(contractAlmostExhausted({ id: '1', creditLimit: null }, balances)).toBe(false);
    });

    it('lists only facts as restrictions', () => {
        expect(restrictions(false, false)).toEqual(['none']);
        expect(restrictions(true, true)).toEqual(['overdue', 'nearly']);
    });
});

describe('credit limit thresholds', () => {
    it('warns below 20% remaining and never without a limit', () => {
        expect(isLimitAlmostExhausted(81, 100)).toBe(true);
        expect(isLimitAlmostExhausted(80, 100)).toBe(false);
        expect(isLimitAlmostExhausted(10, 0)).toBe(false);
    });

    it('clamps the used percent', () => {
        expect(usedPercent(54, 100)).toBe(54);
        expect(usedPercent(150, 100)).toBe(100);
        expect(usedPercent(5, 0)).toBe(0);
    });
});
