import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { ErpOrderReserveService } from '../../erp-order-reserve.service';
import { ReservationViewService } from '../../reservation-view.service';

// Raw-SQL read model on real Postgres: only the columns the queries touch are mirrored.
const { schema, extra } = testSchemaOptions('reservation_view');
const ctx = {} as RequestContext;
// lineFlag memoizes per request context, so each call plays one request.
const freshCtx = (): RequestContext => ({}) as RequestContext;
const visibleOrderIds = new Set<string>();
let dataSource: DataSource;
let erpReserve: ErpOrderReserveService;
let view: ReservationViewService;

const DAY = 24 * 3600 * 1000;
const soon = new Date(Date.now() + 2 * DAY);
const later = new Date(Date.now() + 5 * DAY);

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [],
    });
    await dataSource.initialize();
    for (const ddl of [
        `CREATE TABLE "order" (id int PRIMARY KEY, code varchar, state varchar, "customerId" int)`,
        `CREATE TABLE order_line (id int PRIMARY KEY, "orderId" int, "productVariantId" int, quantity int)`,
        `CREATE TABLE product_variant (id int PRIMARY KEY, sku varchar)`,
        `CREATE TABLE customer (id int PRIMARY KEY, "customFieldsCounterpartyid" int)`,
        `CREATE TABLE counterparty (id int PRIMARY KEY, "shortName" varchar, "assignedManagerId" varchar)`,
        `CREATE TABLE administrator (id int PRIMARY KEY, "firstName" varchar, "lastName" varchar)`,
        `CREATE TABLE reservation ("orderId" varchar, "orderLineId" varchar, "productVariantId" varchar,
            quantity int, status varchar, "reservedAt" timestamp, "expiresAt" timestamp, id SERIAL PRIMARY KEY)`,
        `CREATE TABLE erp_order_reserve (
            "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(),
            uuid uuid NOT NULL, "orderId" varchar NOT NULL, "productVariantId" varchar NOT NULL,
            quantity int NOT NULL, "reserveUntil" timestamp, id SERIAL PRIMARY KEY)`,
        `CREATE UNIQUE INDEX ON erp_order_reserve ("orderId", "productVariantId")`,
    ]) {
        await dataSource.query(ddl);
    }
    const connection = {
        getRepository: () => ({ query: dataSource.query.bind(dataSource) }),
        rawConnection: dataSource,
        withTransaction: async (c: unknown, fn: (c: unknown) => Promise<void>) => fn(c),
    } as unknown as TransactionalConnection;
    const visibility = {
        buildVisibleOrdersQuery: async () => {
            const qb = {
                alias: 'o',
                ids: [] as string[],
                andWhere(_sql: string, params: { ids: string[] }) {
                    qb.ids = params.ids;
                    return qb;
                },
                select: () => qb,
                getMany: async () =>
                    qb.ids.filter(id => visibleOrderIds.has(id)).map(id => ({ id })),
            };
            return qb;
        },
    };
    erpReserve = new ErpOrderReserveService(connection);
    view = new ReservationViewService(connection, visibility as never);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    for (const table of [
        '"order"',
        'order_line',
        'product_variant',
        'customer',
        'counterparty',
        'administrator',
        'reservation',
        'erp_order_reserve',
    ]) {
        await dataSource.query(`DELETE FROM ${table}`);
    }
    visibleOrderIds.clear();
    visibleOrderIds.add('1').add('2');
    await dataSource.query(
        `INSERT INTO product_variant VALUES (10, 'SKU-A'), (20, 'SKU-B');
         INSERT INTO administrator VALUES (7, 'Ann', 'Manager');
         INSERT INTO counterparty VALUES (5, 'Counterparty One', '7');
         INSERT INTO customer VALUES (3, 5);
         INSERT INTO "order" VALUES (1, 'O-1', 'PaymentAuthorized', 3), (2, 'O-2', 'PaymentAuthorized', 3),
            (3, 'O-3', 'Cancelled', 3);
         INSERT INTO order_line VALUES (100, 1, 10, 5), (101, 1, 20, 5), (200, 2, 10, 5), (300, 3, 10, 5)`,
    );
});

describe('ErpOrderReserveService.record', () => {
    const rows = (): Promise<Array<{ quantity: number; reserveUntil: Date | null }>> =>
        dataSource.query(`SELECT quantity, "reserveUntil" FROM erp_order_reserve`);

    it('replaying the same event keeps one row with the same values', async () => {
        const lines = [{ productVariantId: '10', reservedQuantity: 4 }];
        await erpReserve.record(ctx, 1, lines, soon);
        await erpReserve.record(ctx, 1, lines, soon);
        const stored = await rows();
        expect(stored).toHaveLength(1);
        expect(stored[0].quantity).toBe(4);
    });

    it('a later event overwrites the quantity and a missing reserveUntil never clears the date', async () => {
        await erpReserve.record(ctx, 1, [{ productVariantId: '10', reservedQuantity: 4 }], soon);
        await erpReserve.record(ctx, 1, [{ productVariantId: '10', reservedQuantity: 0 }], null);
        const [stored] = await rows();
        expect(stored.quantity).toBe(0);
        expect(stored.reserveUntil?.getTime()).toBe(soon.getTime());
    });

    it('sums two lines of one variant and keeps variants apart', async () => {
        await erpReserve.record(
            ctx,
            1,
            [
                { productVariantId: '10', reservedQuantity: 2 },
                { productVariantId: '10', reservedQuantity: 3 },
                { productVariantId: '20', reservedQuantity: 1 },
            ],
            null,
        );
        const stored = await dataSource.query(
            `SELECT "productVariantId", quantity FROM erp_order_reserve ORDER BY "productVariantId"`,
        );
        expect(stored).toEqual([
            { productVariantId: '10', quantity: 5 },
            { productVariantId: '20', quantity: 1 },
        ]);
    });

    it('a variant missing from the next event is removed, other orders are untouched', async () => {
        const both = [
            { productVariantId: '10', reservedQuantity: 2 },
            { productVariantId: '20', reservedQuantity: 1 },
        ];
        await erpReserve.record(ctx, 1, both, null);
        await erpReserve.record(ctx, 2, both, null);
        await erpReserve.record(ctx, 1, [{ productVariantId: '10', reservedQuantity: 2 }], null);
        const stored = await rows();
        expect(stored.filter(r => r.orderId === '1').map(r => r.productVariantId)).toEqual(['10']);
        expect(stored.filter(r => r.orderId === '2')).toHaveLength(2);
    });

    it('eight concurrent writers leave exactly one row per order and variant', async () => {
        await Promise.all(
            Array.from({ length: 8 }, (_, i) =>
                erpReserve.record(ctx, 1, [{ productVariantId: '10', reservedQuantity: i }], soon),
            ),
        );
        expect(await rows()).toHaveLength(1);
    });
});

describe('ReservationViewService', () => {
    const addLocal = (
        orderId: number,
        lineId: number,
        variantId: number,
        expires: Date,
    ): Promise<unknown> =>
        dataSource.query(`INSERT INTO reservation VALUES ($1, $2, $3, 2, 'active', now(), $4)`, [
            String(orderId),
            String(lineId),
            String(variantId),
            expires,
        ]);

    it('flags a line held locally with the local expiry', async () => {
        await addLocal(1, 100, 10, soon);
        expect(await view.lineFlag(freshCtx(), 100)).toEqual({
            reserved: true,
            reservedUntil: soon,
        });
        expect((await view.lineFlag(freshCtx(), 101)).reserved).toBe(false);
    });

    it('flags a line held by the ERP and takes the earlier of both expiries', async () => {
        await addLocal(1, 100, 10, later);
        await erpReserve.record(ctx, 1, [{ productVariantId: '10', reservedQuantity: 2 }], soon);
        expect(await view.lineFlag(freshCtx(), 100)).toEqual({
            reserved: true,
            reservedUntil: soon,
        });
    });

    it('an ERP row with zero quantity or a cancelled order is not a hold', async () => {
        await erpReserve.record(ctx, 1, [{ productVariantId: '10', reservedQuantity: 0 }], soon);
        await erpReserve.record(ctx, 3, [{ productVariantId: '10', reservedQuantity: 5 }], soon);
        expect((await view.lineFlag(freshCtx(), 100)).reserved).toBe(false);
        expect((await view.lineFlag(freshCtx(), 300)).reserved).toBe(false);
    });

    it("does not leak one order's ERP hold onto another order with the same variant", async () => {
        await erpReserve.record(ctx, 1, [{ productVariantId: '10', reservedQuantity: 2 }], soon);
        expect((await view.lineFlag(freshCtx(), 200)).reserved).toBe(false);
    });

    it('details list local and ERP holds', async () => {
        await addLocal(1, 100, 10, soon);
        await erpReserve.record(ctx, 1, [{ productVariantId: '20', reservedQuantity: 3 }], later);
        const details = await view.details(ctx, 1);
        expect(details.map(d => [d.source, d.sku, d.orderLineId, d.quantity])).toEqual([
            ['LOCAL', 'SKU-A', '100', 2],
            ['ERP', 'SKU-B', '101', 3],
        ]);
    });

    it('splits the ERP hold of a variant across its lines by line quantity', async () => {
        await dataSource.query(`INSERT INTO order_line VALUES (102, 1, 20, 2)`);
        await erpReserve.record(ctx, 1, [{ productVariantId: '20', reservedQuantity: 6 }], later);
        const details = await view.details(ctx, 1);
        expect(details.map(d => [d.orderLineId, d.quantity])).toEqual([
            ['101', 5],
            ['102', 1],
        ]);
        expect((await view.lineFlag(freshCtx(), 101)).reserved).toBe(true);
        expect((await view.lineFlag(freshCtx(), 102)).reserved).toBe(true);
    });

    it('resolves many lines of one request with the same number of queries', async () => {
        await addLocal(1, 100, 10, soon);
        const counted = { n: 0 };
        const original = dataSource.query.bind(dataSource);
        const spy = vi.spyOn(dataSource, 'query').mockImplementation(((...a: unknown[]) => {
            counted.n += 1;
            return (original as (...x: unknown[]) => unknown)(...a);
        }) as never);
        const requestCtx = freshCtx();
        await Promise.all([100, 101, 200, 300].map(id => view.lineFlag(requestCtx, id)));
        spy.mockRestore();
        expect(counted.n).toBeLessThanOrEqual(3);
    });

    it("another counterparty's staff see neither the details nor the holders of an order", async () => {
        await addLocal(1, 100, 10, soon);
        visibleOrderIds.clear();
        expect(await view.details(ctx, 1)).toEqual([]);
        expect(await view.holders(ctx, 10)).toEqual([]);
    });

    it('holders still lists a visible order behind more than a page of foreign ones', async () => {
        const foreign = Array.from({ length: 250 }, (_, i) => 1000 + i);
        for (const id of foreign) {
            await dataSource.query(`INSERT INTO "order" VALUES ($1, $2, 'PaymentAuthorized', 3)`, [
                id,
                `F-${id}`,
            ]);
            await addLocal(id, id, 10, soon);
        }
        await addLocal(1, 100, 10, later);
        const holders = await view.holders(ctx, 10);
        expect(holders.map(h => h.orderCode)).toEqual(['O-1']);
    });

    it('details of an order the staff member cannot see are empty', async () => {
        visibleOrderIds.delete('1');
        await addLocal(1, 100, 10, soon);
        expect(await view.details(ctx, 1)).toEqual([]);
    });

    it('holders lists visible orders only, earliest expiry first, without cancelled or zero holds', async () => {
        await addLocal(1, 100, 10, later);
        await addLocal(2, 200, 10, soon);
        await erpReserve.record(ctx, 3, [{ productVariantId: '10', reservedQuantity: 9 }], soon);
        await erpReserve.record(ctx, 1, [{ productVariantId: '10', reservedQuantity: 0 }], soon);
        const holders = await view.holders(ctx, 10);
        expect(holders.map(h => [h.orderCode, h.source])).toEqual([
            ['O-2', 'LOCAL'],
            ['O-1', 'LOCAL'],
        ]);
        expect(holders[0]).toMatchObject({
            counterpartyName: 'Counterparty One',
            managerName: 'Ann Manager',
        });
        visibleOrderIds.delete('2');
        expect((await view.holders(ctx, 10)).map(h => h.orderCode)).toEqual(['O-1']);
    });
});
