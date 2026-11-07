import { describe, expect, it } from 'vitest';
import { canConfirmOrder, type ConfirmEligibilityInput } from '../../utils/canConfirmOrder';

const open: ConfirmEligibilityInput = {
    cancellable: true,
    lineCount: 2,
    customFields: { isExternal: false, erpOrderId: null, erpRegistrationStatus: null },
};
const with_ = (over: Partial<ConfirmEligibilityInput>): ConfirmEligibilityInput => ({
    ...open,
    ...over,
});

describe('canConfirmOrder', () => {
    it('allows a placed order with lines that nothing owns yet', () => {
        expect(canConfirmOrder(open)).toBe(true);
    });

    it('refuses an order the server no longer lets anyone cancel (cancelled, shipped, settled)', () => {
        expect(canConfirmOrder(with_({ cancellable: false }))).toBe(false);
    });

    it('refuses an empty draft', () => {
        expect(canConfirmOrder(with_({ lineCount: 0 }))).toBe(false);
    });

    it('refuses an order already registered in the ERP', () => {
        const registered = { ...open.customFields, erpOrderId: 'erp-1' };
        const pending = { ...open.customFields, erpRegistrationStatus: 'pending' };
        expect(canConfirmOrder(with_({ customFields: registered }))).toBe(false);
        expect(canConfirmOrder(with_({ customFields: pending }))).toBe(false);
    });

    it('refuses an order that comes from the ERP', () => {
        expect(
            canConfirmOrder(with_({ customFields: { ...open.customFields, isExternal: true } })),
        ).toBe(false);
    });
});
