import { describe, expect, it } from 'vitest';

import { decideCancellation } from '../../order-cancellation.decision';
import type { CancelFacts } from '../../order-cancellation.decision';

const base: CancelFacts = {
    orderState: 'PaymentAuthorized',
    erpStatus: 'PENDING',
    erpOrderId: null,
    latestFulfillmentState: null,
    hasSettledPayment: false,
    cancelRequestStatus: null,
    submission: 'none',
    requestRegistered: true,
};

describe('decideCancellation', () => {
    it.each([
        [
            'not yet sent (pending in the outbox)',
            { submission: 'pending' as const },
            'skip-pending-and-cancel',
        ],
        ['never submitted', {}, 'cancel-without-event'],
        ['sent but unregistered', { submission: 'sent' as const }, 'request-and-cancel'],
        ['registered', { erpOrderId: 'erp-1', submission: 'sent' as const }, 'request-only'],
        [
            'registered, a request already out',
            { erpOrderId: 'erp-1', cancelRequestStatus: 'REQUESTED' },
            'already-requested',
        ],
        ['already cancelled', { orderState: 'Cancelled' }, 'already-cancelled'],
    ])('%s', (_name, facts, action) => {
        expect(decideCancellation({ ...base, ...facts }).action).toBe(action);
    });

    it.each([
        ['in progress', { erpStatus: 'PICKING' }, 'in-progress'],
        ['shipping by ERP status', { erpStatus: 'SHIPPING' }, 'shipped'],
        ['delivering by ERP status', { erpStatus: 'DELIVERING' }, 'shipped'],
        ['delivered by ERP status', { erpStatus: 'DELIVERED' }, 'shipped'],
        ['shipped by order state', { orderState: 'PartiallyShipped' }, 'shipped'],
        ['shipped by fulfillment', { latestFulfillmentState: 'Shipped' }, 'shipped'],
        ['settled payment', { hasSettledPayment: true }, 'paid'],
        [
            'refused by the ERP before',
            { cancelRequestStatus: 'REFUSED', erpOrderId: 'erp-1' },
            'refused-by-erp',
        ],
    ])('refuses: %s', (_name, facts, reason) => {
        expect(decideCancellation({ ...base, ...facts })).toEqual({ action: 'refuse', reason });
    });

    it('shipped wins over a registered order that would otherwise be cancel-requested', () => {
        expect(
            decideCancellation({ ...base, erpOrderId: 'erp-1', erpStatus: 'SHIPPING' }).action,
        ).toBe('refuse');
    });

    describe('at the reserve deadline (requestRegistered=false)', () => {
        const deadline = { requestRegistered: false };

        it('leaves a registered order to the ERP', () => {
            expect(decideCancellation({ ...base, ...deadline, erpOrderId: 'erp-1' }).action).toBe(
                'leave-to-erp',
            );
        });

        it('keeps the #204 rules for a rejected order', () => {
            expect(
                decideCancellation({
                    ...base,
                    ...deadline,
                    erpStatus: 'REJECTED',
                    submission: 'sent',
                }),
            ).toEqual({ action: 'refuse', reason: 'registration-rejected' });
        });

        it('still cancels a pending or unregistered order', () => {
            expect(decideCancellation({ ...base, ...deadline, submission: 'pending' }).action).toBe(
                'skip-pending-and-cancel',
            );
            expect(decideCancellation({ ...base, ...deadline, submission: 'sent' }).action).toBe(
                'request-and-cancel',
            );
        });

        it('a rejected order is cancellable on an explicit request', () => {
            expect(
                decideCancellation({ ...base, erpStatus: 'REJECTED', submission: 'sent' }).action,
            ).toBe('request-and-cancel');
        });
    });
});
