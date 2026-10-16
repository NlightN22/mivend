import { describe, expect, it } from 'vitest';

import { OrderLineEditService } from '../../order-line-edit.service';
import {
    mockCtx,
    TestOrder,
    TestOrderLine,
    TestReservation,
    TestStockLevel,
    useReserveOrderHarness,
} from './reserve-order.harness';

const h = useReserveOrderHarness('order_line_edit_concurrency');

const outcome = (r: PromiseSettledResult<unknown>): string =>
    r.status === 'fulfilled' ? 'ok' : String((r as PromiseRejectedResult).reason);

function editService(): OrderLineEditService {
    const qb = { alias: 'o', andWhere: () => qb, getOne: async () => ({}) };
    const orderService = {
        findOne: async (ctx: unknown, id: string) =>
            h.connection
                .getRepository(ctx as never, { name: 'Order' } as never)
                .findOne({ where: { id }, relations: ['lines'] } as never)
                .then((o: unknown) => {
                    const order = o as { lines: Array<Record<string, unknown>> };
                    order.lines.forEach(l => (l.productVariant = h.productVariant));
                    return order;
                }),
        applyPriceAdjustments: async () => undefined,
    };
    return new OrderLineEditService(
        h.connection,
        { buildVisibleOrdersQuery: async () => qb } as never,
        { dictionary: async () => ({ get: () => null }) } as never,
        h.service,
        orderService as never,
        { createHistoryEntryForOrder: async () => undefined } as never,
        { publish: () => undefined } as never,
        { requiredMultiple: async () => 1 } as never,
        { get: () => ({ forOrder: async () => [] }) } as never,
        { run: async () => undefined } as never,
        { get: () => ({ submissionState: async () => 'none' }) } as never,
        { afterLinesEdited: async () => undefined } as never,
    );
}

describe('OrderLineEditService (integration, real Postgres, concurrency)', () => {
    it('a quantity edit and a concurrent reserve never leave a reservation that differs from the line', async () => {
        await h.dataSource.getRepository(TestStockLevel).save({
            productVariantId: 'variant-e1',
            stockLocationId: h.location.id,
            stockOnHand: 100,
            stockAllocated: 0,
        });
        const order = await h.dataSource
            .getRepository(TestOrder)
            .save({ customerId: 'customer-1', customFields: { branchId: 'branch-1' } });
        const line = await h.dataSource.getRepository(TestOrderLine).save({
            orderId: order.id,
            productVariantId: 'variant-e1',
            productVariantEntityId: h.productVariant.id,
            quantity: 10,
        });

        const results = await Promise.allSettled([
            editService().setQuantity(mockCtx, order.id, line.id, 4),
            h.service.reserveOrder(mockCtx, order.id, 7, 'manual'),
        ]);

        const finalLine = await h.dataSource
            .getRepository(TestOrderLine)
            .findOneByOrFail({ id: line.id });
        const active = await h.dataSource
            .getRepository(TestReservation)
            .find({ where: { orderId: order.id, status: 'active' } });
        // The edit always lands: it either runs first (reserve sees 4) or releases the reserve it finds.
        expect(results[0].status).toBe('fulfilled');
        expect(finalLine.quantity).toBe(4);
        for (const row of active) expect(row.quantity).toBe(4);
    });

    it('two concurrent removals of different lines leave the order with its remaining line', async () => {
        const order = await h.dataSource
            .getRepository(TestOrder)
            .save({ customerId: 'customer-1' });
        const lines = await h.dataSource.getRepository(TestOrderLine).save(
            [1, 2, 3].map(n => ({
                orderId: order.id,
                productVariantId: `variant-r${n}`,
                productVariantEntityId: h.productVariant.id,
                quantity: n,
            })),
        );
        const results = await Promise.allSettled([
            editService().removeLine(mockCtx, order.id, lines[0].id),
            editService().removeLine(mockCtx, order.id, lines[1].id),
        ]);
        expect(results.map(outcome)).toEqual(['ok', 'ok']);
        expect(
            await h.dataSource.getRepository(TestOrderLine).count({ where: { orderId: order.id } }),
        ).toBe(1);
    });

    it('two concurrent removals of the only two lines cannot empty the order', async () => {
        const order = await h.dataSource
            .getRepository(TestOrder)
            .save({ customerId: 'customer-1' });
        const lines = await h.dataSource.getRepository(TestOrderLine).save(
            [1, 2].map(n => ({
                orderId: order.id,
                productVariantId: `variant-q${n}`,
                productVariantEntityId: h.productVariant.id,
                quantity: n,
            })),
        );
        const results = await Promise.allSettled([
            editService().removeLine(mockCtx, order.id, lines[0].id),
            editService().removeLine(mockCtx, order.id, lines[1].id),
        ]);
        expect(results.map(outcome).filter(o => o === 'ok')).toHaveLength(1);
        expect(results.map(outcome).join()).toContain('without lines');
        expect(
            await h.dataSource.getRepository(TestOrderLine).count({ where: { orderId: order.id } }),
        ).toBe(1);
    });
});
