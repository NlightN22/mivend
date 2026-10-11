import { describe, it, expect } from 'vitest';
import { isNotRegisteredInErp } from '../../pages/orders/isNotRegisteredInErp';

describe('isNotRegisteredInErp', () => {
    it('is true without an ERP registration status', () => {
        expect(isNotRegisteredInErp({ erpRegistrationStatus: null })).toBe(true);
        expect(isNotRegisteredInErp(null)).toBe(true);
    });

    it('is false with only a document number', () => {
        expect(
            isNotRegisteredInErp({
                erpRegistrationStatus: null,
                erpRegistrationDocumentNumber: '123',
            }),
        ).toBe(false);
    });

    it('is false with a registration status', () => {
        expect(isNotRegisteredInErp({ erpRegistrationStatus: 'SENT' })).toBe(false);
    });
});
