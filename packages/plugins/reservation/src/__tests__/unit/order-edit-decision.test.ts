import { describe, expect, it } from 'vitest';

import { decideEdit } from '../../order-cancellation.decision';
import type { CancelFacts } from '../../order-cancellation.decision';

const base: CancelFacts = {
    orderState: 'PaymentAuthorized',
    erpStatus: null,
    erpOrderId: null,
    latestFulfillmentState: null,
    hasSettledPayment: false,
    cancelRequestStatus: null,
    submission: 'none',
    requestRegistered: true,
};

describe('decideEdit', () => {
    it('allows an unsent order, paid or not', () => {
        expect(decideEdit(base)).toEqual({ allowed: true });
        expect(decideEdit({ ...base, hasSettledPayment: true })).toEqual({ allowed: true });
        expect(decideEdit({ ...base, submission: 'pending' })).toEqual({ allowed: true });
    });

    it.each([
        [{ orderState: 'Cancelled' }, 'cancelled'],
        [{ orderState: 'Shipped' }, 'shipped'],
        [{ erpStatus: { shipped: false, warehouseStarted: true, rejected: false } }, 'in-progress'],
        [{ erpOrderId: 'erp-1' }, 'sent-to-erp'],
        [{ submission: 'sent' as const }, 'sent-to-erp'],
    ])('refuses %j', (patch, reason) => {
        expect(decideEdit({ ...base, ...patch })).toEqual({ allowed: false, reason });
    });

    it('lets staff fix an order the ERP rejected', () => {
        const rejected = { shipped: false, warehouseStarted: false, rejected: true };
        expect(decideEdit({ ...base, erpStatus: rejected, submission: 'sent' })).toEqual({
            allowed: true,
        });
    });
});
