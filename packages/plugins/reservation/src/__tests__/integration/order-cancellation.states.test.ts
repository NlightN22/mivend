import { describe, expect, it } from 'vitest';

import { UnknownOrderUuidError } from '../../reservation-errors';
import { TestPayment, mockCtx, useReserveOrderHarness } from './reserve-order.harness';
import {
    activeReservations,
    buildCancellationFixture,
    loadOrder,
    seedCancellableOrder,
} from './order-cancellation.harness';

const h = useReserveOrderHarness('order_cancellation_states');

// Component chain on real Postgres: sent -> registered -> cancel requested -> the ERP's answer,
// plus the three cancel cases of docs/order-contracts.md ("Reserve and order cancellation").
describe('OrderCancellationService.cancel (real Postgres)', () => {
    it('a confirmed event still waiting in the outbox is skipped and the order is cancelled locally, nothing is sent', async () => {
        const f = buildCancellationFixture(h);
        f.port.submission = 'pending';
        const order = await seedCancellableOrder(h);

        const outcome = await f.service.cancel(mockCtx, order.id, 'customer-request');

        expect(outcome).toEqual({ kind: 'cancelled', eventSent: false });
        expect(f.port.skipCalls).toBe(1);
        expect(f.port.requestCalls).toBe(0);
        const reloaded = await loadOrder(h, order.id);
        expect(reloaded.state).toBe('Cancelled');
        expect(reloaded.customFields.cancelReason).toBe('customer-request');
        expect(await activeReservations(h, order.id)).toBe(0);
    });

    it('an order never submitted is cancelled locally without touching the outbox', async () => {
        const f = buildCancellationFixture(h);
        const order = await seedCancellableOrder(h);

        expect(await f.service.cancel(mockCtx, order.id, 'staff-request')).toEqual({
            kind: 'cancelled',
            eventSent: false,
        });
        expect(f.port.skipCalls).toBe(0);
        expect(f.port.requestCalls).toBe(0);
    });

    it('sent but not registered: publishes cancel-requested and cancels locally at once', async () => {
        const f = buildCancellationFixture(h);
        f.port.submission = 'sent';
        const order = await seedCancellableOrder(h);

        const outcome = await f.service.cancel(mockCtx, order.id, 'reserve-expired', {
            requestRegistered: false,
        });

        expect(outcome).toEqual({ kind: 'cancelled', eventSent: true });
        expect(f.port.requested).toEqual([
            { orderId: order.id, orderUuid: order.uuid, orderCode: 'ORD-1' },
        ]);
        const reloaded = await loadOrder(h, order.id);
        expect(reloaded.state).toBe('Cancelled');
        expect(reloaded.customFields.cancelRequestStatus).toBe('REQUESTED');
        expect(await activeReservations(h, order.id)).toBe(0);
    });

    it('the publisher winning the skip race turns "pending" into "sent": the ERP is told', async () => {
        const f = buildCancellationFixture(h);
        f.port.submission = 'pending';
        f.port.publisherWinsSkipRace = true;
        const order = await seedCancellableOrder(h);

        const outcome = await f.service.cancel(mockCtx, order.id, 'customer-request');

        expect(outcome).toEqual({ kind: 'cancelled', eventSent: true });
        expect(f.port.requestCalls).toBe(1);
    });

    it('registered: requests the cancel and keeps the order until the ERP answers; a repeat is a no-op', async () => {
        const f = buildCancellationFixture(h);
        f.port.submission = 'sent';
        const order = await seedCancellableOrder(h, { erpOrderId: 'erp-1' });

        const first = await f.service.cancel(mockCtx, order.id, 'customer-request');
        const second = await f.service.cancel(mockCtx, order.id, 'customer-request');

        expect(first).toEqual({ kind: 'cancel-requested' });
        expect(second).toEqual({ kind: 'already-requested' });
        expect(f.port.requestCalls).toBe(1);
        const reloaded = await loadOrder(h, order.id);
        expect(reloaded.state).not.toBe('Cancelled');
        expect(reloaded.customFields).toMatchObject({
            cancelRequestStatus: 'REQUESTED',
            cancelReason: 'customer-request',
        });
        expect(reloaded.customFields.cancelRequestedAt).toBeTruthy();
        expect(await activeReservations(h, order.id)).toBe(1);
    });

    it('registered at the reserve deadline: left to the ERP, nothing sent, nothing cancelled', async () => {
        const f = buildCancellationFixture(h);
        const order = await seedCancellableOrder(h, { erpOrderId: 'erp-1' });

        const outcome = await f.service.cancel(mockCtx, order.id, 'reserve-expired', {
            requestRegistered: false,
        });

        expect(outcome).toEqual({ kind: 'left-to-erp' });
        expect(f.port.requestCalls).toBe(0);
        expect((await loadOrder(h, order.id)).state).not.toBe('Cancelled');
    });

    it('a repeat cancel of an already cancelled order is a no-op', async () => {
        const f = buildCancellationFixture(h);
        const order = await seedCancellableOrder(h);
        await f.service.cancel(mockCtx, order.id, 'customer-request');

        expect(await f.service.cancel(mockCtx, order.id, 'customer-request')).toEqual({
            kind: 'already-cancelled',
        });
        expect(f.cancelOrderCalls).toHaveLength(1);
    });

    it('voids the authorized payment on a local cancel', async () => {
        const f = buildCancellationFixture(h);
        const order = await seedCancellableOrder(h);
        const payment = await h.dataSource
            .getRepository(TestPayment)
            .save({ orderId: order.id, state: 'Authorized' });

        await f.service.cancel(mockCtx, order.id, 'customer-request');

        expect(f.cancelledPayments).toEqual([payment.id]);
    });

    it.each([
        ['in progress', { erpStatus: 'PICKING' }, 'PaymentAuthorized', 'in-progress'],
        ['shipped (ERP status)', { erpStatus: 'SHIPPING' }, 'PaymentAuthorized', 'shipped'],
        ['shipped (order state)', {}, 'Delivered', 'shipped'],
    ])('%s: no automatic cancel', async (_name, fields, state, reason) => {
        const f = buildCancellationFixture(h);
        const order = await seedCancellableOrder(h, fields, state);

        expect(await f.service.cancel(mockCtx, order.id, 'customer-request')).toEqual({
            kind: 'not-cancellable',
            reason,
        });
        expect(f.port.requestCalls).toBe(0);
        expect(await activeReservations(h, order.id)).toBe(1);
    });

    it('a settled payment is not cancelled automatically (needs a refund)', async () => {
        const f = buildCancellationFixture(h);
        const order = await seedCancellableOrder(h);
        await h.dataSource.getRepository(TestPayment).save({ orderId: order.id, state: 'Settled' });

        expect(await f.service.cancel(mockCtx, order.id, 'customer-request')).toEqual({
            kind: 'not-cancellable',
            reason: 'paid',
        });
    });
});

describe('OrderCancelResultService.apply (real Postgres)', () => {
    async function requestedOrder(f: ReturnType<typeof buildCancellationFixture>) {
        f.port.submission = 'sent';
        const order = await seedCancellableOrder(h, { erpOrderId: 'erp-1' });
        await f.service.cancel(mockCtx, order.id, 'customer-request');
        return order;
    }
    const answer = (uuid: string, status: 'cancelled' | 'rejected') => ({
        orderUuid: uuid,
        status,
        rejectionReasonCode: status === 'rejected' ? 'IN_PROGRESS' : null,
        rejectionReasonText: status === 'rejected' ? 'warehouse order exists' : null,
    });

    it('cancelled: the local order follows the ERP; a redelivery is a no-op', async () => {
        const f = buildCancellationFixture(h);
        const order = await requestedOrder(f);

        expect(await f.results.apply(mockCtx, answer(order.uuid, 'cancelled'))).toBe('cancelled');
        expect(await f.results.apply(mockCtx, answer(order.uuid, 'cancelled'))).toBe(
            'already-cancelled',
        );

        const reloaded = await loadOrder(h, order.id);
        expect(reloaded.state).toBe('Cancelled');
        expect(reloaded.customFields.cancelRequestStatus).toBe('CANCELLED');
        expect(await activeReservations(h, order.id)).toBe(0);
        expect(f.cancelOrderCalls).toHaveLength(1);
    });

    it('rejected: the order stays, the refusal is recorded and staff are told', async () => {
        const f = buildCancellationFixture(h);
        const order = await requestedOrder(f);

        expect(await f.results.apply(mockCtx, answer(order.uuid, 'rejected'))).toBe(
            'refusal-recorded',
        );

        const reloaded = await loadOrder(h, order.id);
        expect(reloaded.state).not.toBe('Cancelled');
        expect(reloaded.customFields).toMatchObject({
            cancelRequestStatus: 'REFUSED',
            cancelRefusalReason: 'IN_PROGRESS warehouse order exists',
        });
        expect(f.notifications).toEqual([expect.objectContaining({ kind: 'error' })]);
        expect(await f.service.cancel(mockCtx, order.id, 'customer-request')).toEqual({
            kind: 'not-cancellable',
            reason: 'refused-by-erp',
        });
    });

    it('rejected after a local cancel (sent but unregistered) is reported as an error to staff', async () => {
        const f = buildCancellationFixture(h);
        f.port.submission = 'sent';
        const order = await seedCancellableOrder(h);
        await f.service.cancel(mockCtx, order.id, 'reserve-expired');

        expect(await f.results.apply(mockCtx, answer(order.uuid, 'rejected'))).toBe(
            'refusal-after-local-cancel',
        );
        expect(f.notifications.at(-1)).toMatchObject({ kind: 'error' });
    });

    it('an unknown orderUuid is a retriable UnknownOrderUuidError', async () => {
        const f = buildCancellationFixture(h);
        await expect(
            f.results.apply(mockCtx, answer('00000000-0000-4000-8000-000000000000', 'cancelled')),
        ).rejects.toBeInstanceOf(UnknownOrderUuidError);
    });
});
