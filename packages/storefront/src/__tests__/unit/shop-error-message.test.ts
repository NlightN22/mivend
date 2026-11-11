import { describe, expect, it } from 'vitest';
import { shopErrorMessage } from '../../utils/shopErrorMessage';

describe('shopErrorMessage', () => {
    it('translates a known error code', () =>
        expect(
            shopErrorMessage({ errorCode: 'PAYMENT_DECLINED_ERROR' }, 'checkout.placeFailed'),
        ).toBe('Payment was declined'));

    it('translates the placement rejection when no branch can be resolved (#347)', () =>
        expect(
            shopErrorMessage(
                { errorCode: 'ORDER_STATE_TRANSITION_ERROR' },
                'cartErrors.paymentFailed',
            ),
        ).toMatch(/cannot be placed right now/));

    it('falls back to the translated generic message for an unknown code or no result', () => {
        expect(shopErrorMessage({ errorCode: 'SOME_UNMAPPED_ERROR' }, 'checkout.placeFailed')).toBe(
            'Could not place order',
        );
        expect(shopErrorMessage(null, 'cartErrors.paymentFailed')).toBe(
            'Could not proceed to payment',
        );
    });
});
