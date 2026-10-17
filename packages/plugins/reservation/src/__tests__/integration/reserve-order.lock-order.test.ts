import { describe, expect, it } from 'vitest';

import {
    mockCtx,
    TestOrder,
    TestOrderLine,
    TestReservation,
    TestStockLevel,
    useReserveOrderHarness,
} from './reserve-order.harness';

const h = useReserveOrderHarness('reserve_order_lock_order');
const VARIANTS = ['variant-1', 'variant-2', 'variant-3'];

async function seedOrder(variantIds: string[]): Promise<TestOrder> {
    const order = await h.dataSource
        .getRepository(TestOrder)
        .save({ customerId: 'customer-1', customFields: { branchId: 'branch-1' } });
    for (const productVariantId of variantIds) {
        await h.dataSource.getRepository(TestOrderLine).save({
            orderId: order.id,
            productVariantId,
            productVariantEntityId: h.productVariant.id,
            quantity: 1,
        });
    }
    return order;
}

// Stock levels are locked in ascending id order up front, so line order cannot cross the lock order.
describe('ReservationService.reserveOrder lock order (integration, real Postgres)', () => {
    it('orders over the same variants in opposite line order never deadlock', async () => {
        for (const productVariantId of VARIANTS) {
            await h.dataSource.getRepository(TestStockLevel).save({
                productVariantId,
                stockLocationId: h.location.id,
                stockOnHand: 1000,
                stockAllocated: 0,
            });
        }

        for (let round = 0; round < 6; round++) {
            const orderA = await seedOrder(VARIANTS);
            const orderB = await seedOrder([...VARIANTS].reverse());

            const results = await Promise.allSettled([
                h.service.reserveOrder(mockCtx, orderA.id, 7, 'manual'),
                h.service.reserveOrder(mockCtx, orderB.id, 7, 'manual'),
            ]);

            expect(results.map(r => r.status)).toEqual(['fulfilled', 'fulfilled']);
        }
        const active = await h.dataSource
            .getRepository(TestReservation)
            .count({ where: { status: 'active' } });
        expect(active).toBe(6 * 2 * VARIANTS.length);
    });
});
