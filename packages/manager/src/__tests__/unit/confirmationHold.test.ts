import { describe, expect, it } from 'vitest';
import { confirmationCaseLabel, heldConfirmationCase } from '../../utils/confirmationHold';

describe('heldConfirmationCase', () => {
    it('returns the matrix case that held the order', () => {
        const code = 'payment.confirmation.cash.pickup.deferred';
        const label = 'cash, pickup, deferred terms';
        const payments = [
            { metadata: { placement: { confirmationCase: code, confirmationHold: true } } },
        ];
        expect(heldConfirmationCase(payments)).toBe(label);
    });

    it('words a bank transfer case without terms', () => {
        expect(confirmationCaseLabel('payment.confirmation.bank-transfer.delivery.no-terms')).toBe(
            'bank transfer, delivery, no deferred terms',
        );
    });

    it('returns null for a case that did not hold, a limit hold or no metadata', () => {
        expect(
            heldConfirmationCase([
                { metadata: { placement: { confirmationCase: 'x', confirmationHold: false } } },
                { metadata: { placement: {} } },
                { metadata: null },
                {},
            ]),
        ).toBeNull();
    });
});
