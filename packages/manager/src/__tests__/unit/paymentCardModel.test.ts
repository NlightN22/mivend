import { describe, expect, it } from 'vitest';
import {
    orderStateLabel,
    orderStateVariant,
    proformaStatusLabel,
    refundLabel,
    refundVariant,
} from '../../components/payment-detail/paymentCardModel';

describe('payment card status mapping', () => {
    it('shows human labels for the order state and the proforma display status', () => {
        expect(orderStateLabel('PaymentAuthorized')).not.toBe('PaymentAuthorized');
        expect(proformaStatusLabel('current')).toBe('Current');
        expect(proformaStatusLabel('cancelled')).toBe('Cancelled');
    });

    it('falls back to the raw code and a neutral badge for an unknown value', () => {
        expect(orderStateLabel('Mystery')).toBe('Mystery');
        expect(orderStateVariant('Mystery')).toBe('neutral');
    });

    it('capitalises refund statuses and colours them', () => {
        expect(refundLabel('succeeded')).toBe('Succeeded');
        expect(refundVariant('succeeded')).toBe('success');
        expect(refundVariant('failed')).toBe('danger');
    });
});
