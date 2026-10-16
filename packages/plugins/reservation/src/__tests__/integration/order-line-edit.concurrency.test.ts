import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { withAggregateLock } from 'shared';

import { ReservationReleasedEvent } from '../../reservation.events';
import { OrderLineEditGuard } from '../../order-line-edit.guard';
import { OrderLineStockSyncService } from '../../order-line-stock-sync.service';
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

// Vendure's allocation over real tables, as @vendure/core 3.7.3 StockMovementService does it: ALLOCATION and RELEASE rows
// store +q and move stockAllocated by +q / -q (SALE stores -q); the real service cannot be bootstrapped in this harness.
const stockMovement = {
    createAllocationsForOrderLines: (
        _c: unknown,
        lines: Array<{ orderLineId: string; quantity: number }>,
    ) => moveStock('ALLOCATION', 1, lines),
    createReleasesForOrderLines: (
        _c: unknown,
        lines: Array<{ orderLineId: string; quantity: number }>,
    ) => moveStock('RELEASE', -1, lines),
};

async function moveStock(
    type: string,
    sign: number,
    lines: Array<{ orderLineId: string; quantity: number }>,
): Promise<void> {
    for (const { orderLineId, quantity } of lines) {
        await h.dataSource.query(
            `INSERT INTO stock_movement (type, quantity, "orderLineId") VALUES ($1, $2, $3)`,
            [type, quantity, orderLineId],
        );
        await h.dataSource.query(
            `UPDATE reservation_test_stock_level SET "stockAllocated" = "stockAllocated" + $1
              WHERE "productVariantId" = (SELECT "productVariantId" FROM reservation_test_order_line WHERE id = $2)`,
            [sign * quantity, orderLineId],
        );
    }
}

const outcome = (r: PromiseSettledResult<unknown>): string =>
    r.status === 'fulfilled' ? 'ok' : String((r as PromiseRejectedResult).reason);

function editService(
    reissue: (ctx: never, orderId: string) => Promise<void> = async () => undefined,
): OrderLineEditService {
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
        new OrderLineEditGuard(
            { dictionary: async () => ({ get: () => null }) } as never,
            h.service,
            { get: () => ({ submissionState: async () => 'none' }) } as never,
        ),
        orderService as never,
        { createHistoryEntryForOrder: async () => undefined } as never,
        { publish: () => undefined } as never,
        { requiredMultiple: async () => 1 } as never,
        { get: () => ({ forOrder: async () => [] }) } as never,
        { run: async () => undefined } as never,
        { afterLinesEdited: reissue } as never,
        new OrderLineStockSyncService(h.connection, stockMovement as never),
    );
}

beforeAll(async () => {
    await h.dataSource.query(
        `CREATE TABLE IF NOT EXISTS stock_movement (id SERIAL PRIMARY KEY, type varchar NOT NULL, quantity int NOT NULL, "orderLineId" varchar NOT NULL, "stockLocationId" varchar)`,
    );
});
beforeEach(async () => {
    await h.dataSource.query('TRUNCATE TABLE stock_movement');
});

async function allocatedLine(quantity: number, allocate: boolean) {
    await h.dataSource.getRepository(TestStockLevel).save({
        productVariantId: 'variant-s1',
        stockLocationId: h.location.id,
        stockOnHand: 100,
        stockAllocated: allocate ? quantity : 0,
    });
    const order = await h.dataSource
        .getRepository(TestOrder)
        .save({ customerId: 'customer-1', customFields: { branchId: 'branch-1' } });
    const [line, other] = await h.dataSource.getRepository(TestOrderLine).save(
        [quantity, 1].map(q => ({
            orderId: order.id,
            productVariantId: 'variant-s1',
            productVariantEntityId: h.productVariant.id,
            quantity: q,
        })),
    );
    if (allocate) {
        await h.dataSource.query(
            `INSERT INTO stock_movement (type, quantity, "orderLineId") VALUES ('ALLOCATION', $1, $2)`,
            [quantity, line.id],
        );
    }
    return { order, line, other };
}

const stockState = async (): Promise<{ allocated: number; net: number }> => ({
    allocated: (
        await h.dataSource
            .getRepository(TestStockLevel)
            .findOneByOrFail({ productVariantId: 'variant-s1' })
    ).stockAllocated,
    net: Number(
        (
            await h.dataSource.query(
                `SELECT COALESCE(SUM(CASE WHEN type = 'ALLOCATION' THEN quantity ELSE -quantity END), 0) AS net FROM stock_movement`,
            )
        )[0].net,
    ),
});

describe('OrderLineStockSyncService (integration, real Postgres)', () => {
    it('quantity up allocates, quantity down releases, stockAllocated follows the movements', async () => {
        const { order, line } = await allocatedLine(10, true);
        await editService().setQuantity(mockCtx, order.id, line.id, 14);
        expect(await stockState()).toEqual({ allocated: 14, net: 14 });
        await editService().setQuantity(mockCtx, order.id, line.id, 3);
        expect(await stockState()).toEqual({ allocated: 3, net: 3 });
    });

    it('removing an allocated line releases it, drops its rows and keeps stockAllocated non-negative', async () => {
        const { order, line } = await allocatedLine(10, true);
        await editService().removeLine(mockCtx, order.id, line.id);
        expect(await stockState()).toEqual({ allocated: 0, net: 0 });
        expect(
            await h.dataSource.getRepository(TestOrderLine).count({ where: { id: line.id } }),
        ).toBe(0);
    });

    it('a placed order whose lines were never allocated is left alone', async () => {
        const { order, line } = await allocatedLine(10, false);
        await editService().setQuantity(mockCtx, order.id, line.id, 2);
        await editService().removeLine(mockCtx, order.id, line.id);
        expect(await stockState()).toEqual({ allocated: 0, net: 0 });
    });

    it('other movement types of the line are not deleted by a removal', async () => {
        const { order, line } = await allocatedLine(10, true);
        await h.dataSource.query(
            `INSERT INTO stock_movement (type, quantity, "orderLineId") VALUES ('SALE', -1, $1)`,
            [line.id],
        );
        await h.dataSource.query(`UPDATE reservation_test_stock_level SET "stockAllocated" = 9`);
        await editService().removeLine(mockCtx, order.id, line.id);
        const kept = await h.dataSource.query(`SELECT type FROM stock_movement`);
        expect(kept).toEqual([{ type: 'SALE' }]);
        expect((await stockState()).allocated).toBe(0);
    });
});

const pause = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// Vendure's placement transition: state + allocation in one transaction, committed together.
async function placementTransition(
    order: { id: string },
    line: { id: string },
    quantity: number,
    orderFirst: boolean,
): Promise<void> {
    await h.dataSource.transaction(async em => {
        const markPlaced = (): Promise<unknown> =>
            em.query(`UPDATE reservation_test_order SET active = false WHERE id = $1`, [order.id]);
        if (orderFirst) await markPlaced();
        await em.query(
            `INSERT INTO stock_movement (type, quantity, "orderLineId") VALUES ('ALLOCATION', $1, $2)`,
            [quantity, line.id],
        );
        await em.query(
            `UPDATE reservation_test_stock_level SET "stockAllocated" = "stockAllocated" + $1`,
            [quantity],
        );
        await pause(300);
        if (!orderFirst) await markPlaced();
    });
}

describe('edit vs Vendure placement transition (integration, real Postgres, concurrency)', () => {
    it.each([true, false])(
        'an edit racing the allocating transition (order row first: %s) leaves allocation equal to the line',
        async orderFirst => {
            const { order, line } = await allocatedLine(10, false);
            await h.dataSource.query(
                `UPDATE reservation_test_order SET active = true WHERE id = $1`,
                [order.id],
            );

            const [, edit] = await Promise.allSettled([
                placementTransition(order, line, 10, orderFirst),
                pause(100).then(() => editService().setQuantity(mockCtx, order.id, line.id, 4)),
            ]);

            const finalLine = await h.dataSource
                .getRepository(TestOrderLine)
                .findOneByOrFail({ id: line.id });
            const state = await stockState();
            expect(state.allocated).toBe(state.net);
            expect(state.allocated).toBe(finalLine.quantity);
            if (!orderFirst)
                expect(String((edit as PromiseRejectedResult).reason)).toMatch(/not placed yet/);
        },
    );
});

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

    it('an edit over an active reservation releases it and emits nothing but the release event', async () => {
        const { order, line } = await allocatedLine(10, false);
        await h.service.reserveOrder(mockCtx, order.id, 7, 'manual');
        h.published.length = 0;

        await editService().setQuantity(mockCtx, order.id, line.id, 4);

        await editService().setQuantity(mockCtx, order.id, line.id, 2);

        // One release event per reservation row (the order has two lines), however often the order is edited.
        expect(h.published).toHaveLength(2);
        expect(h.published.every(e => e instanceof ReservationReleasedEvent)).toBe(true);
        const rows = await h.dataSource
            .getRepository(TestReservation)
            .find({ where: { orderId: order.id } });
        expect(rows.every(r => r.status === 'released')).toBe(true);
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

    it('edits that reissue proforma invoices never deadlock with a concurrent proforma issuer', async () => {
        const order = await h.dataSource
            .getRepository(TestOrder)
            .save({ customerId: 'customer-1' });
        const line = await h.dataSource.getRepository(TestOrderLine).save({
            orderId: order.id,
            productVariantId: 'variant-d1',
            productVariantEntityId: h.productVariant.id,
            quantity: 10,
        });
        const proformaKey = `proformaInvoices-for-order:${order.id}`;
        // Mirrors ProformaInvoiceIssuingService: the same advisory lock, re-entered under the edit's.
        const reissue = async (c: never): Promise<void> =>
            withAggregateLock(h.connection, c, proformaKey, async () => undefined);
        const issuer = (): Promise<void> =>
            withAggregateLock(h.connection, mockCtx, proformaKey, async () => undefined);

        const results = await Promise.allSettled([
            editService(reissue).setQuantity(mockCtx, order.id, line.id, 4),
            issuer(),
            editService(reissue).setQuantity(mockCtx, order.id, line.id, 6),
            issuer(),
            h.service.reserveOrder(mockCtx, order.id, 7, 'manual'),
        ]);
        expect(
            results.filter(r => r.status === 'rejected' && /deadlock/i.test(String(r.reason))),
        ).toEqual([]);
    });
});
