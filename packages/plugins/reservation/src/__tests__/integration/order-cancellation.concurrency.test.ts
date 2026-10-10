import { describe, expect, it } from 'vitest';

import { OrderNotEligibleError } from '../../reservation-errors';
import {
    TestOrderLine,
    TestStockLevel,
    mockCtx,
    useReserveOrderHarness,
} from './reserve-order.harness';
import {
    activeReservations,
    buildCancellationFixture,
    loadOrder,
    seedCancellableOrder,
} from './order-cancellation.harness';

const h = useReserveOrderHarness('order_cancellation_concurrency');

// Cancel, manual confirm and a late registration result share the `reserve-order:<id>` lock; the
// fake cancelOrder delay widens the window, so without the lock the competing writer lands in it.
describe('order cancel vs competing writers (real Postgres)', () => {
    it('cancel vs manual confirm: one winner, a cancelled order never keeps an active reservation', async () => {
        const f = buildCancellationFixture(h);
        const order = await seedCancellableOrder(h);
        await h.dataSource.query('DELETE FROM reservation_test_reservation WHERE "orderId" = $1', [
            order.id,
        ]);
        await h.dataSource.getRepository(TestStockLevel).save({
            productVariantId: 'variant-1',
            stockLocationId: h.location.id,
            stockOnHand: 50,
            stockAllocated: 0,
        });
        await h.dataSource.getRepository(TestOrderLine).save({
            orderId: order.id,
            productVariantId: 'variant-1',
            productVariantEntityId: h.productVariant.id,
            quantity: 2,
        });

        const confirm = async (): Promise<void> => {
            await new Promise(resolve => setTimeout(resolve, 20));
            try {
                await h.service.confirmOrder(mockCtx, order.id, 7);
            } catch (error) {
                expect(error).toBeInstanceOf(OrderNotEligibleError);
            }
        };
        await Promise.all([f.service.cancel(mockCtx, order.id, 'customer-request'), confirm()]);

        expect((await loadOrder(h, order.id)).state).toBe('Cancelled');
        expect(await activeReservations(h, order.id)).toBe(0);
    });

    it('two concurrent cancels of a registered order send one request and cancel nothing locally', async () => {
        const f = buildCancellationFixture(h);
        f.port.submission = 'sent';
        f.port.delayMs = 40;
        const order = await seedCancellableOrder(h, { erpOrderId: 'erp-1' });

        const outcomes = await Promise.all([
            f.service.cancel(mockCtx, order.id, 'customer-request'),
            f.service.cancel(mockCtx, order.id, 'customer-request'),
        ]);

        expect(outcomes.map(o => o.kind).sort()).toEqual(['already-requested', 'cancel-requested']);
        expect(f.port.requestCalls).toBe(1);
    });

    it('two concurrent cancels of an unregistered sent order cancel it once', async () => {
        const f = buildCancellationFixture(h);
        f.port.submission = 'sent';
        const order = await seedCancellableOrder(h);

        const outcomes = await Promise.all([
            f.service.cancel(mockCtx, order.id, 'reserve-expired'),
            f.service.cancel(mockCtx, order.id, 'customer-request'),
        ]);

        expect(outcomes.map(o => o.kind).sort()).toEqual(['already-cancelled', 'cancelled']);
        expect(f.cancelOrderCalls).toHaveLength(1);
        expect(f.port.requestCalls).toBe(1);
    });

    it('cancel vs late registration result: either order leaves a consistent order, one request', async () => {
        const f = buildCancellationFixture(h);
        f.port.submission = 'sent';
        f.port.delayMs = 40;
        const order = await seedCancellableOrder(h, { erpStatus: 'SENT_TO_ERP' });

        await Promise.all([
            f.service.cancel(mockCtx, order.id, 'customer-request'),
            f.writeOff.handleOrderRegistrationResult(mockCtx, {
                orderUuid: null,
                orderEntityId: 'erp-9',
                requestEntityId: null,
                localOrderId: order.id,
                rejected: false,
                reservedLines: [],
                unresolvedProductIds: [],
                documentNumber: '1',
                status: 'registered',
                rejectionReasonCode: null,
                rejectionReasonText: null,
            }),
        ]);

        const reloaded = await loadOrder(h, order.id);
        expect(f.port.requestCalls).toBe(1);
        expect(reloaded.customFields).toMatchObject({
            erpOrderId: 'erp-9',
            cancelRequestStatus: 'REQUESTED',
            erpRegistrationStatus: 'registered',
        });
        const cancelledLocally = reloaded.state === 'Cancelled';
        expect(await activeReservations(h, order.id)).toBe(cancelledLocally ? 0 : 1);
    });

    it('a registration result applied first makes the cancel a request, not a local cancel', async () => {
        const f = buildCancellationFixture(h);
        f.port.submission = 'sent';
        const order = await seedCancellableOrder(h, { erpStatus: 'SENT_TO_ERP' });
        await f.writeOff.handleOrderRegistrationResult(mockCtx, {
            orderUuid: null,
            orderEntityId: 'erp-9',
            requestEntityId: null,
            localOrderId: order.id,
            rejected: false,
            reservedLines: [],
            unresolvedProductIds: [],
            documentNumber: null,
            status: '',
            rejectionReasonCode: null,
            rejectionReasonText: null,
        });

        const outcome = await f.service.cancel(mockCtx, order.id, 'customer-request');

        expect(outcome).toEqual({ kind: 'cancel-requested' });
        expect((await loadOrder(h, order.id)).state).not.toBe('Cancelled');
    });
});
