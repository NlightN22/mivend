import { describe, expect, it } from 'vitest';

import { OrderStatusDictionary, testOrderStatusDictionary } from '@mivend/plugin-erp-order';

import {
    decideCancellation,
    erpStageFacts,
    isOrderCancellable,
} from '../../order-cancellation.decision';
import type { CancelFacts } from '../../order-cancellation.decision';

const dictionary = testOrderStatusDictionary();
const stage = (code: string) => erpStageFacts(dictionary, code);

const base: CancelFacts = {
    orderState: 'PaymentAuthorized',
    erpStatus: stage('PENDING'),
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
        ['in progress', { erpStatus: stage('PICKING') }, 'in-progress'],
        ['shipping by ERP status', { erpStatus: stage('SHIPPING') }, 'shipped'],
        ['delivering by ERP status', { erpStatus: stage('DELIVERING') }, 'shipped'],
        ['delivered by ERP status', { erpStatus: stage('DELIVERED') }, 'shipped'],
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
            decideCancellation({ ...base, erpOrderId: 'erp-1', erpStatus: stage('SHIPPING') })
                .action,
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
                    erpStatus: stage('REJECTED'),
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
    });

    it.each([
        ['without an ERP id', {}],
        ['with an ERP id', { erpOrderId: 'erp-1' }],
    ])('a rejected order is cancelled locally on request, %s', (_name, facts) => {
        expect(
            decideCancellation({
                ...base,
                ...facts,
                erpStatus: stage('REJECTED'),
                submission: 'sent',
            }).action,
        ).toBe('cancel-rejected-locally');
    });
});

describe('isOrderCancellable', () => {
    it.each([
        ['pending', {}, true],
        ['registered', { erpOrderId: 'erp-1' }, true],
        ['rejected by the ERP', { erpStatus: stage('REJECTED') }, true],
        ['paid', { hasSettledPayment: true }, false],
        ['picking', { erpStatus: stage('PICKING') }, false],
        ['shipped', { orderState: 'Shipped' }, false],
        ['already cancelled', { orderState: 'Cancelled' }, false],
        ['cancel refused by the ERP', { cancelRequestStatus: 'REFUSED' }, false],
        ['active cart', { orderState: 'AddingItems' }, false],
        ['active cart in checkout', { orderState: 'ArrangingPayment' }, false],
    ])('%s', (_name, facts, expected) => {
        expect(isOrderCancellable({ ...base, ...facts })).toBe(expected);
    });
});

describe('decision follows dictionary attributes, not status names', () => {
    it('refuses a status flagged warehouseStarted whatever its code', () => {
        const custom = new OrderStatusDictionary([
            ...dictionary.entries,
            { ...dictionary.get('APPROVED')!, code: 'NEW_ERP_STAGE', warehouseStarted: true },
        ]);
        expect(
            decideCancellation({ ...base, erpStatus: erpStageFacts(custom, 'NEW_ERP_STAGE') }),
        ).toEqual({ action: 'refuse', reason: 'in-progress' });
    });

    it('knows nothing about a status that is not in the dictionary', () => {
        expect(erpStageFacts(dictionary, 'UNKNOWN')).toBeNull();
    });
});
