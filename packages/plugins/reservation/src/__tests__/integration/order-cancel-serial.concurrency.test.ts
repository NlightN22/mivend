import { describe, expect, it } from 'vitest';
import { TransactionalConnection } from '@vendure/core';
import type { RequestContext } from '@vendure/core';
import { withAggregateLock } from 'shared';

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

const visibleQuery = { alias: 'o', andWhere: () => visibleQuery, getOne: async () => ({}) };
const visibleToAll = { buildVisibleOrdersQuery: async () => visibleQuery } as never;

// Mirrors core's cancelOrder: release the allocation of a not-yet-cancelled order, then transition,
// whose hook releases reservations. The sleep widens the window a missing lock would leave open.
function fakeCore(stockLevelId: string): { calls: number; orderService: unknown } {
    orderCancelReleaseProcess.init?.({
        get: (token: unknown) =>
            token === ReservationService
                ? h.service
                : token === TransactionalConnection
                  ? h.connection
                  : undefined,
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
            await orderCancelReleaseProcess.onTransitionStart?.('PaymentSettled', 'Cancelled', {
                ctx,
                order: order as never,
            });
            await orders.update(order.id, { state: 'Cancelled' });
            // The acquiring hook closes the proformas after the order-row write.
            await withAggregateLock(
                h.connection,
                ctx,
                `proformaInvoices-for-order:${order.id}`,
                () => sleep(1),
            );
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
        const service = new OrderCancelSerialService(
            h.connection,
            core.orderService as never,
            visibleToAll,
        );
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

    it('a partial cancel of an already cancelled order still reaches core', async () => {
        const order = await seedCancellableOrder(h, {}, 'Cancelled');
        const level = await h.dataSource.getRepository(TestStockLevel).save({
            productVariantId: 'variant-serial-partial',
            stockLocationId: h.location.id,
            stockOnHand: 10,
            stockAllocated: 0,
        });
        const core = fakeCore(level.id);
        const service = new OrderCancelSerialService(
            h.connection,
            core.orderService as never,
            visibleToAll,
        );

        const whole = await service.cancelOrder(mockCtx, { orderId: order.id });
        const partial = await service.cancelOrder(mockCtx, {
            orderId: order.id,
            lines: [{ orderLineId: '1', quantity: 1 }],
        });

        expect((whole as { state: string }).state).toBe('Cancelled');
        expect(core.calls).toBe(1);
        expect(partial).toEqual({ message: 'already cancelled' });
    });

    it('a cancel and a concurrent order-line edit both complete without a deadlock', async () => {
        const order = await seedCancellableOrder(h, {}, 'PaymentSettled');
        const level = await h.dataSource.getRepository(TestStockLevel).save({
            productVariantId: 'variant-serial-edit',
            stockLocationId: h.location.id,
            stockOnHand: 10,
            stockAllocated: 2,
        });
        const core = fakeCore(level.id);
        const service = new OrderCancelSerialService(
            h.connection,
            core.orderService as never,
            visibleToAll,
        );
        // OrderLineEditService.edit's lock order: proforma, reserve, then the order row.
        const edit = withAggregateLock(
            h.connection,
            mockCtx,
            `proformaInvoices-for-order:${order.id}`,
            async tx1 => {
                await sleep(30);
                await withAggregateLock(
                    h.connection,
                    tx1,
                    `reserve-order:${order.id}`,
                    async tx2 => {
                        await manager(tx2)
                            .getRepository(TestOrder)
                            .createQueryBuilder('o')
                            .setLock('pessimistic_write')
                            .where('o.id = :id', { id: order.id })
                            .getOne();
                    },
                );
            },
        );

        const results = await Promise.allSettled([
            service.cancelOrder(mockCtx, { orderId: order.id }),
            edit,
        ]);

        expect(results.map(r => r.status)).toEqual(['fulfilled', 'fulfilled']);
        expect((await loadOrder(h, order.id)).state).toBe('Cancelled');
    });
});
