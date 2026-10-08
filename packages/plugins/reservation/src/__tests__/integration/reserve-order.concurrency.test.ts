import { describe, expect, it } from 'vitest';

import { InsufficientStockError } from '../../reservation-errors';
import {
    mockCtx,
    TestOrder,
    TestOrderLine,
    TestReservation,
    TestStockLevel,
    useReserveOrderHarness,
} from './reserve-order.harness';

const h = useReserveOrderHarness('reserve_order_concurrency');

describe('ReservationService.reserveOrder (integration, real Postgres, concurrency)', () => {
    it('exactly one of two concurrent reserveOrder() calls succeeds when combined demand exceeds ATP', async () => {
        await h.dataSource.getRepository(TestStockLevel).save({
            productVariantId: 'variant-1',
            stockLocationId: h.location.id,
            stockOnHand: 5,
            stockAllocated: 0,
        });

        const orderA = await h.dataSource
            .getRepository(TestOrder)
            .save({ customerId: 'customer-1', customFields: { branchId: 'branch-1' } });
        await h.dataSource.getRepository(TestOrderLine).save({
            orderId: orderA.id,
            productVariantId: 'variant-1',
            productVariantEntityId: h.productVariant.id,
            quantity: 3,
        });

        const orderB = await h.dataSource
            .getRepository(TestOrder)
            .save({ customerId: 'customer-1', customFields: { branchId: 'branch-1' } });
        await h.dataSource.getRepository(TestOrderLine).save({
            orderId: orderB.id,
            productVariantId: 'variant-1',
            productVariantEntityId: h.productVariant.id,
            quantity: 3,
        });

        const results = await Promise.allSettled([
            h.service.reserveOrder(mockCtx, orderA.id, 7, 'manual'),
            h.service.reserveOrder(mockCtx, orderB.id, 7, 'manual'),
        ]);

        const fulfilled = results.filter(r => r.status === 'fulfilled');
        const rejected = results.filter(r => r.status === 'rejected');
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
            InsufficientStockError,
        );

        const allReservations = await h.dataSource.getRepository(TestReservation).find({
            where: { productVariantId: 'variant-1', status: 'active' },
        });
        // No double-reservation past ATP — only the winner's line got a row.
        expect(allReservations).toHaveLength(1);
        expect(allReservations[0].quantity).toBe(3);
    });

    it('is idempotent — repeat calls for an already-reserved order return the same rows without re-locking', async () => {
        await h.dataSource.getRepository(TestStockLevel).save({
            productVariantId: 'variant-2',
            stockLocationId: h.location.id,
            stockOnHand: 10,
            stockAllocated: 0,
        });
        const order = await h.dataSource
            .getRepository(TestOrder)
            .save({ customerId: 'customer-1', customFields: { branchId: 'branch-1' } });
        await h.dataSource.getRepository(TestOrderLine).save({
            orderId: order.id,
            productVariantId: 'variant-2',
            productVariantEntityId: h.productVariant.id,
            quantity: 4,
        });

        const first = await h.service.reserveOrder(mockCtx, order.id, 7, 'manual');
        const second = await h.service.reserveOrder(mockCtx, order.id, 7, 'manual');

        expect(second.map(r => r.id)).toEqual(first.map(r => r.id));
        const all = await h.dataSource.getRepository(TestReservation).find({
            where: { orderId: order.id, status: 'active' },
        });
        expect(all).toHaveLength(1);
    });

    it('two concurrent reserveOrder() calls for the SAME order create one reservation set', async () => {
        await h.dataSource.getRepository(TestStockLevel).save({
            productVariantId: 'variant-3',
            stockLocationId: h.location.id,
            stockOnHand: 100,
            stockAllocated: 0,
        });
        const order = await h.dataSource
            .getRepository(TestOrder)
            .save({ customerId: 'customer-1', customFields: { branchId: 'branch-1' } });
        await h.dataSource.getRepository(TestOrderLine).save({
            orderId: order.id,
            productVariantId: 'variant-3',
            productVariantEntityId: h.productVariant.id,
            quantity: 4,
        });

        await Promise.all([
            h.service.reserveOrder(mockCtx, order.id, 7, 'auto-trust-rule'),
            h.service.reserveOrder(mockCtx, order.id, 7, 'manual'),
        ]);

        const active = await h.dataSource.getRepository(TestReservation).find({
            where: { orderId: order.id, status: 'active' },
        });
        expect(active).toHaveLength(1);
    });
});
