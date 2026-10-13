import { describe, expect, it } from 'vitest';

import { ageEntries, paymentStatusOf } from '../../settlement-aging';

const day = (n: number): Date => new Date(Date.UTC(2026, 8, n));
const now = day(30);

describe('ageEntries (FIFO)', () => {
    it('closes the oldest debt first and reports the overdue remainder', () => {
        const result = ageEntries({
            openingBalanceMinor: 0,
            openingDate: day(1),
            delayDays: 5,
            now,
            entries: [
                { key: 'a', date: day(2), amountMinor: 1000, dueDate: null },
                { key: 'b', date: day(20), amountMinor: 500, dueDate: null },
                { key: 'p', date: day(25), amountMinor: -1200, dueDate: null },
            ],
        });
        expect(result.openByKey.get('a')).toBe(0);
        expect(result.openByKey.get('b')).toBe(300);
        expect(result.overdueMinor).toBe(300);
    });

    it('uses the own due date over date plus delay', () => {
        const result = ageEntries({
            openingBalanceMinor: 0,
            openingDate: day(1),
            delayDays: 30,
            now,
            entries: [{ key: 'a', date: day(2), amountMinor: 1000, dueDate: day(10) }],
        });
        expect(result.overdueMinor).toBe(1000);
    });

    it('counts a positive opening balance as overdue and lets credits close it first', () => {
        const base = {
            openingBalanceMinor: 700,
            openingDate: day(1),
            delayDays: 5,
            now,
        };
        const open = ageEntries({ ...base, entries: [] });
        expect(open.overdueMinor).toBe(700);
        const paid = ageEntries({
            ...base,
            entries: [{ key: 'p', date: day(3), amountMinor: -700, dueDate: null }],
        });
        expect(paid.overdueMinor).toBe(0);
    });

    it('ignores entries before the opening date and treats a negative opening as credit', () => {
        const result = ageEntries({
            openingBalanceMinor: -400,
            openingDate: day(10),
            delayDays: 0,
            now,
            entries: [
                { key: 'old', date: day(2), amountMinor: 9999, dueDate: null },
                { key: 'a', date: day(11), amountMinor: 1000, dueDate: null },
            ],
        });
        expect(result.openByKey.has('old')).toBe(false);
        expect(result.openByKey.get('a')).toBe(600);
    });
});

describe('paymentStatusOf', () => {
    it('maps open amounts to a customer status', () => {
        expect(paymentStatusOf(1000, 0, day(10), now)).toBe('paid');
        expect(paymentStatusOf(1000, 400, day(40), now)).toBe('partial');
        expect(paymentStatusOf(1000, 1000, day(40), now)).toBe('open');
        expect(paymentStatusOf(1000, 400, day(10), now)).toBe('overdue');
        expect(paymentStatusOf(-500, 0, undefined, now)).toBeNull();
        expect(paymentStatusOf(1000, undefined, undefined, now)).toBeNull();
    });
});
