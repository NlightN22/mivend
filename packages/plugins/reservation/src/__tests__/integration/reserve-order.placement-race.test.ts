import { describe, expect, it, vi } from 'vitest';
import type { Order } from '@vendure/core';

import { OrderReservedEvent } from '../../reservation.events';
import { ReservationFailureService } from '../../reservation-failure.service';
import { ReservationPaymentService } from '../../reservation-payment.service';
import {
    mockCtx,
    TestOrder,
    TestOrderLine,
    TestReservation,
    TestStockLevel,
    useReserveOrderHarness,
} from './reserve-order.harness';

const h = useReserveOrderHarness('reserve_order_placement_race');

// The placement-event path (auto-reserve on placement, #198) shares reserveOrder() with the manual
// confirm; these cover the race between them and the repeat of the placement event (#199).
describe('auto-reserve on placement vs manual confirm (real Postgres)', () => {
    const failures = { record: vi.fn(async () => undefined) };

    function paymentService(): ReservationPaymentService {
        return new ReservationPaymentService(
            h.connection,
            h.service,
            {
                getSettings: async () => ({ customFields: { autoReserveOnPlacement: true } }),
            } as never,
            failures as unknown as ReservationFailureService,
        );
    }

    async function placedOrder(): Promise<{ id: string; placed: Order }> {
        await h.dataSource.getRepository(TestStockLevel).save({
            productVariantId: 'variant-1',
            stockLocationId: h.location.id,
            stockOnHand: 100,
            stockAllocated: 0,
        });
        const order = await h.dataSource.getRepository(TestOrder).save({
            customerId: 'customer-1',
            customFields: { branchId: 'branch-1', reservationState: 'NOT_REQUIRED' },
        });
        await h.dataSource.getRepository(TestOrderLine).save({
            orderId: order.id,
            productVariantId: 'variant-1',
            productVariantEntityId: h.productVariant.id,
            quantity: 4,
        });
        const placed = {
            id: order.id,
            customFields: { branchId: 'branch-1', reservationState: 'NOT_REQUIRED' },
            payments: [],
        } as unknown as Order;
        return { id: order.id, placed };
    }

    const reservedEvents = (): number =>
        h.published.filter(e => e instanceof OrderReservedEvent).length;

    // Audit finding (#199): the AWAITING_CONFIRMATION write used to be unconditional, so a confirm that
    // finished between the handler's state read and its write was rolled back to AWAITING_CONFIRMATION.
    it('does not roll an already RESERVED order back to AWAITING_CONFIRMATION when its state read was stale', async () => {
        const { id, placed } = await placedOrder();
        await h.dataSource
            .getRepository(TestOrder)
            .update(
                { id },
                { customFields: { branchId: 'branch-1', reservationState: 'RESERVED' } },
            );

        const service = paymentService() as unknown as {
            markAwaitingConfirmation: (ctx: unknown, order: Order) => Promise<void>;
        };
        await service.markAwaitingConfirmation(mockCtx, placed);

        const order = await h.dataSource.getRepository(TestOrder).findOneByOrFail({ id });
        expect(order.customFields.reservationState).toBe('RESERVED');
    });

    it('moves a NOT_REQUIRED order to AWAITING_CONFIRMATION', async () => {
        const { id, placed } = await placedOrder();

        const service = paymentService() as unknown as {
            markAwaitingConfirmation: (ctx: unknown, order: Order) => Promise<void>;
        };
        await service.markAwaitingConfirmation(mockCtx, placed);

        const order = await h.dataSource.getRepository(TestOrder).findOneByOrFail({ id });
        expect(order.customFields.reservationState).toBe('AWAITING_CONFIRMATION');
    });

    it('a manual confirm racing with the placement auto-reserve yields one reservation set and a RESERVED order', async () => {
        failures.record.mockClear();
        const { id, placed } = await placedOrder();

        await Promise.all([
            paymentService().handleOrderPlaced(mockCtx, placed),
            h.service.confirmOrder(mockCtx, id, 7),
        ]);

        const active = await h.dataSource
            .getRepository(TestReservation)
            .find({ where: { orderId: id, status: 'active' } });
        expect(active).toHaveLength(1);
        const order = await h.dataSource.getRepository(TestOrder).findOneByOrFail({ id });
        expect(order.customFields.reservationState).toBe('RESERVED');
        expect(reservedEvents()).toBe(1);
        expect(failures.record).not.toHaveBeenCalled();
    });

    it('auto-reserve success marks the order RESERVED, and a repeated placement event never creates a second reservation set or a second OrderReservedEvent', async () => {
        failures.record.mockClear();
        const { id, placed } = await placedOrder();
        const service = paymentService();

        await service.handleOrderPlaced(mockCtx, placed);
        await service.handleOrderPlaced(mockCtx, {
            ...placed,
            customFields: { ...placed.customFields },
        } as Order);

        const rows = await h.dataSource
            .getRepository(TestReservation)
            .find({ where: { orderId: id } });
        expect(rows.filter(r => r.status === 'active')).toHaveLength(1);
        expect(rows[0].creationMethod).toBe('auto-trust-rule');
        const order = await h.dataSource.getRepository(TestOrder).findOneByOrFail({ id });
        expect(order.customFields.reservationState).toBe('RESERVED');
        expect(reservedEvents()).toBe(1);
    });
});
