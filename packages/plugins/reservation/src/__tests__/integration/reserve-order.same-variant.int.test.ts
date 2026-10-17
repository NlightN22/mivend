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

const h = useReserveOrderHarness('reserve_order_same_variant');

describe('ReservationService.reserveOrder two lines of one variant (integration, real Postgres)', () => {
    async function seedOrder(stockOnHand: number, quantities: number[]): Promise<string> {
        await h.dataSource.getRepository(TestStockLevel).save({
            productVariantId: 'variant-1',
            stockLocationId: h.location.id,
            stockOnHand,
            stockAllocated: 0,
        });
        const order = await h.dataSource
            .getRepository(TestOrder)
            .save({ customerId: 'customer-1', customFields: { branchId: 'branch-1' } });
        for (const quantity of quantities) {
            await h.dataSource.getRepository(TestOrderLine).save({
                orderId: order.id,
                productVariantId: 'variant-1',
                productVariantEntityId: h.productVariant.id,
                quantity,
            });
        }
        return order.id;
    }

    it('rejects an order whose lines of the same variant together exceed free stock', async () => {
        const orderId = await seedOrder(5, [3, 3]);

        await expect(h.service.reserveOrder(mockCtx, orderId, 7, 'manual')).rejects.toBeInstanceOf(
            InsufficientStockError,
        );

        expect(
            await h.dataSource.getRepository(TestReservation).find({ where: { status: 'active' } }),
        ).toHaveLength(0);
    });

    it('reserves both lines when together they fit free stock', async () => {
        const orderId = await seedOrder(6, [3, 3]);

        const rows = await h.service.reserveOrder(mockCtx, orderId, 7, 'manual');

        expect(rows.map(r => r.quantity)).toEqual([3, 3]);
    });
});
