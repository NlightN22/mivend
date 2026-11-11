import { describe, expect, it } from 'vitest';
import { heldConfirmationCase } from '../../utils/confirmationHold';

describe('heldConfirmationCase', () => {
    it('returns the matrix case that held the order', () => {
        const code = 'payment.confirmation.cash.pickup.deferred';
        const payments = [
            { metadata: { placement: { confirmationCase: code, confirmationHold: true } } },
        ];
        expect(heldConfirmationCase(payments)).toBe(code);
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
