import { describe, expect, it } from 'vitest';
import { shopErrorMessage } from '../../utils/shopErrorMessage';

describe('shopErrorMessage', () => {
    it('translates a known error code', () =>
        expect(
            shopErrorMessage({ errorCode: 'PAYMENT_DECLINED_ERROR' }, 'checkout.placeFailed'),
        ).toBe('Payment was declined'));

    it('falls back to the translated generic message for an unknown code or no result', () => {
        expect(
            shopErrorMessage({ errorCode: 'ORDER_STATE_TRANSITION_ERROR' }, 'checkout.placeFailed'),
        ).toBe('Could not place order');
        expect(shopErrorMessage(null, 'cartErrors.paymentFailed')).toBe(
            'Could not proceed to payment',
        );
    });
});
