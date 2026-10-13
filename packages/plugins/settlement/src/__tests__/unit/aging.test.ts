import { describe, expect, it } from 'vitest';

import { capOverdue, paymentStatusOf } from '../../settlement-aging';

const now = new Date('2026-09-30T00:00:00Z');
const past = new Date('2026-09-10T00:00:00Z');
const future = new Date('2026-10-10T00:00:00Z');

describe('capOverdue', () => {
    it('never exceeds what is owed now', () => {
        expect(capOverdue(500, 300)).toBe(300);
        expect(capOverdue(200, 300)).toBe(200);
    });

    it('is zero for an overpaid or empty balance', () => {
        expect(capOverdue(500, -100)).toBe(0);
        expect(capOverdue(500, 0)).toBe(0);
    });
});

describe('paymentStatusOf', () => {
    it('maps open amounts to a customer status', () => {
        expect(paymentStatusOf(1000, 0, past, now)).toBe('paid');
        expect(paymentStatusOf(1000, 400, future, now)).toBe('partial');
        expect(paymentStatusOf(1000, 1000, future, now)).toBe('open');
        expect(paymentStatusOf(1000, 400, past, now)).toBe('overdue');
    });

    it('is null for credits and unknown without a FIFO row', () => {
        expect(paymentStatusOf(-500, 0, null, now)).toBeNull();
        expect(paymentStatusOf(1000, null, null, now)).toBe('unknown');
    });
});
