import { describe, expect, it } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { OrderCancelSerialService } from '../../order-cancel-serial.service';
import { orderCancelReleaseProcess } from '../../order-cancel-release.process';
import { ReservationService } from '../../reservation.service';
import {
    activeReservations,
    loadOrder,
    seedCancellableOrder,
    sleep,
} from './order-cancellation.harness';
import {
    TestOrder,
    TestStockLevel,
    mockCtx,
    useReserveOrderHarness,
} from './reserve-order.harness';

const h = useReserveOrderHarness('order_cancel_serial_concurrency');

const manager = (ctx: RequestContext) =>
    (ctx as unknown as { __manager: import('typeorm').EntityManager }).__manager;

// Mirrors core's cancelOrder: release the allocation of a not-yet-cancelled order, then transition,
// whose hook releases reservations. The sleep widens the window a missing lock would leave open.
function fakeCore(stockLevelId: number): { calls: number; orderService: unknown } {
    orderCancelReleaseProcess.init?.({
        get: (token: unknown) => (token === ReservationService ? h.service : undefined),
    } as never);
    const fake = { calls: 0, orderService: {} as unknown };
    fake.orderService = {
        cancelOrder: async (ctx: RequestContext, input: { orderId: string }) => {
            fake.calls += 1;
            const orders = manager(ctx).getRepository(TestOrder);
            const order = await orders.findOneByOrFail({ id: input.orderId });
            if (order.state === 'Cancelled') return { message: 'already cancelled' };
            await manager(ctx)
                .getRepository(TestStockLevel)
                .decrement({ id: stockLevelId }, 'stockAllocated', 2);
            await sleep(60);
            await orders.update(order.id, { state: 'Cancelled' });
            await orderCancelReleaseProcess.onTransitionEnd?.('PaymentSettled', 'Cancelled', {
                ctx,
                order: order as never,
            });
            return order;
        },
    };
    return fake;
}

describe('Admin API cancelOrder serialized per order (real Postgres)', () => {
    it('two concurrent cancels release the allocation and the reservations exactly once', async () => {
        const order = await seedCancellableOrder(h, {}, 'PaymentSettled');
        const level = await h.dataSource.getRepository(TestStockLevel).save({
            productVariantId: 'variant-serial',
            stockLocationId: h.location.id,
            stockOnHand: 10,
            stockAllocated: 2,
        });
        const core = fakeCore(level.id);
        const service = new OrderCancelSerialService(h.connection, core.orderService as never);
        const published = h.published.length;

        await Promise.all([
            service.cancelOrder(mockCtx, { orderId: order.id }),
            service.cancelOrder(mockCtx, { orderId: order.id }),
        ]);

        const stored = await h.dataSource
            .getRepository(TestStockLevel)
            .findOneByOrFail({ id: level.id });
        expect(stored.stockAllocated).toBe(0);
        expect(core.calls).toBe(1);
        expect((await loadOrder(h, order.id)).state).toBe('Cancelled');
        expect(await activeReservations(h, order.id)).toBe(0);
        expect(h.published.length - published).toBe(1);
    });
});
