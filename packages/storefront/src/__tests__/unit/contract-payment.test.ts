import { describe, expect, it } from 'vitest';
import { contractDebt, initialAmountText } from '../../pages/account/contractPayment';

const now = new Date('2026-10-20T00:00:00Z');
const doc = (contractId: string, openAmount: number, dueDate: string | null) => ({
    id: `${contractId}-${openAmount}`,
    currency: 'RUB',
    amount: openAmount * 2,
    openAmount,
    dueDate,
    orders: [],
    contractId,
});

describe('contractDebt', () => {
    it('sums open amounts of one contract and its overdue part', () => {
        const unpaid = [
            doc('c1', 4_000_000, '2026-11-01T00:00:00Z'),
            doc('c1', 2_000_000, '2026-10-01T00:00:00Z'),
            doc('c2', 999, null),
        ];
        expect(contractDebt('c1', unpaid, now)).toEqual({
            minor: 6_000_000,
            overdueMinor: 2_000_000,
        });
        expect(contractDebt('c3', unpaid, now)).toEqual({ minor: 0, overdueMinor: 0 });
    });
});

describe('initialAmountText', () => {
    it('prefills the debt only in debt mode', () => {
        const debt = { minor: 6_000_050, overdueMinor: 0 };
        expect(initialAmountText('debt-repayment', debt, 'en-GB')).toBe('60,000.50');
        expect(initialAmountText('debt-repayment', debt, 'ru').replace(/\s/g, ' ')).toBe(
            '60 000,50',
        );
        expect(initialAmountText('advance', debt, 'ru')).toBe('');
        expect(initialAmountText('debt-repayment', { minor: 0, overdueMinor: 0 }, 'ru')).toBe('');
    });
});
