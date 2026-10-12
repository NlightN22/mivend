import { describe, expect, it } from 'vitest';
import type { PaymentForm } from 'shared';

import { decidePlacement, payableAmountKopecks } from '../../placement-policy';

const base = { limitControlled: true, exceeded: false, allowExceeding: false, acknowledged: false };

describe('decidePlacement', () => {
    it.each<[PaymentForm, string, boolean]>([
        ['cash', 'erp-now', true],
        ['bank-transfer', 'erp-now', true],
        ['card', 'after-payment', false],
    ])('within the limit, %s -> %s (counts: %s)', (form, route, counts) => {
        expect(decidePlacement({ ...base, form })).toEqual({
            route,
            countsAgainstLimit: counts,
            creditLimitExceeded: false,
            prepayment: false,
        });
    });

    it('over the limit, a card order is cured by its payment and goes to the ERP after it', () => {
        expect(
            decidePlacement({ ...base, form: 'card', exceeded: true, acknowledged: false }),
        ).toEqual({
            route: 'after-payment',
            countsAgainstLimit: false,
            creditLimitExceeded: false,
            prepayment: false,
        });
    });

    it.each<PaymentForm>(['cash', 'bank-transfer'])(
        'over the limit, %s waits for a manager unless exceeding is allowed and acknowledged',
        form => {
            const over = { ...base, form, exceeded: true };
            expect(decidePlacement(over)).toMatchObject({
                route: 'manager-confirmation',
                creditLimitExceeded: true,
                countsAgainstLimit: true,
            });
            expect(decidePlacement({ ...over, acknowledged: true }).route).toBe(
                'manager-confirmation',
            );
            expect(decidePlacement({ ...over, allowExceeding: true }).route).toBe(
                'manager-confirmation',
            );
            expect(
                decidePlacement({ ...over, allowExceeding: true, acknowledged: true }).route,
            ).toBe('erp-now');
        },
    );

    it.each<[PaymentForm, string]>([
        ['cash', 'erp-now'],
        ['bank-transfer', 'erp-now'],
        ['card', 'after-payment'],
    ])('without a limit, %s -> %s as prepayment', (form, route) => {
        const decision = decidePlacement({ ...base, form, limitControlled: false, exceeded: true });
        expect(decision).toMatchObject({
            route,
            creditLimitExceeded: false,
            prepayment: form !== 'card',
        });
    });
});

describe('payableAmountKopecks', () => {
    it('adds the existing excess to a card payment only', () => {
        expect(payableAmountKopecks('card', 2_000, 3_000)).toBe(5_000);
        expect(payableAmountKopecks('card', 2_000, 0)).toBe(2_000);
        expect(payableAmountKopecks('cash', 2_000, 3_000)).toBe(2_000);
        expect(payableAmountKopecks('bank-transfer', 2_000, 3_000)).toBe(2_000);
    });
});
