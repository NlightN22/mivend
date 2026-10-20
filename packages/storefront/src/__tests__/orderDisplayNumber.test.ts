import { describe, expect, it } from 'vitest';
import { orderDisplayNumber } from '../pages/orders/orderFormat';

describe('orderDisplayNumber', () => {
    it('shows the mivend code for an own order', () => {
        expect(orderDisplayNumber({ code: '100045', customFields: { isExternal: false } })).toBe(
            '100045',
        );
    });

    it('shows the ERP registration number for an external order', () => {
        const order = {
            code: '100046',
            customFields: { isExternal: true, erpRegistrationDocumentNumber: '00-000123' },
        };
        expect(orderDisplayNumber(order)).toBe('00-000123');
    });

    it('falls back to the code when an external order has no ERP number yet', () => {
        const order = {
            code: '100047',
            customFields: { isExternal: true, erpRegistrationDocumentNumber: null },
        };
        expect(orderDisplayNumber(order)).toBe('100047');
    });
});
