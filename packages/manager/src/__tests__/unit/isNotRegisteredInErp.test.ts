import { describe, it, expect } from 'vitest';
import { isNotRegisteredInErp } from '../../composables/isNotRegisteredInErp';

describe('isNotRegisteredInErp', () => {
    it('is true when there is neither an ERP order id nor a registration status', () => {
        expect(isNotRegisteredInErp({ erpOrderId: null, erpRegistrationStatus: null })).toBe(true);
        expect(isNotRegisteredInErp({ erpOrderId: '', erpRegistrationStatus: '' })).toBe(true);
    });

    it('is false once the order has an ERP id or a registration status', () => {
        expect(isNotRegisteredInErp({ erpOrderId: 'e1', erpRegistrationStatus: null })).toBe(false);
        expect(isNotRegisteredInErp({ erpOrderId: null, erpRegistrationStatus: 'SENT' })).toBe(
            false,
        );
    });
});
