import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { Order } from '@vendure/core';
import type { RequestContext } from '@vendure/core';
import { ExternalOrderRetentionService } from '@mivend/plugin-erp-order';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

@Entity('order')
class TestOrder {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'timestamp', nullable: true }) orderPlacedAt!: Date | null;
    @Column({ name: 'customFieldsErporderid', type: 'varchar', nullable: true })
    erpOrderId!: string | null;
    @Column({ name: 'customFieldsIsexternal', type: 'boolean', default: false })
    isExternal!: boolean;
    @Column({ name: 'customFieldsErpmarkedfordeletion', type: 'boolean', nullable: true })
    marked!: boolean | null;
}

const { schema, extra } = testSchemaOptions('external_order_retention');
let dataSource: DataSource;
let service: ExternalOrderRetentionService;
const ctx = {} as RequestContext;
const daysAgo = (days: number): Date => new Date(Date.now() - days * 86_400_000);

async function insertOrder(opts: {
    erpId: string;
    marked?: boolean | null;
    external?: boolean;
    placed?: Date | null;
}): Promise<number> {
    const [row] = await dataSource.query(
        `INSERT INTO "order" ("orderPlacedAt", "customFieldsErporderid", "customFieldsIsexternal",
            "customFieldsErpmarkedfordeletion") VALUES ($1, $2, $3, $4) RETURNING id`,
        [
            opts.placed === undefined ? daysAgo(800) : opts.placed,
            opts.erpId,
            opts.external ?? true,
            opts.marked === undefined ? true : opts.marked,
        ],
    );
    return row.id as number;
}

const exists = async (id: number): Promise<boolean> =>
    (await dataSource.query('SELECT 1 FROM "order" WHERE id = $1', [id])).length > 0;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestOrder],
        synchronize: true,
    });
    await dataSource.initialize();
    for (const ddl of [
        `CREATE TABLE payment_attempt ("orderId" int, "paymentStatus" varchar)`,
        `CREATE TABLE proforma_invoice ("orderId" int, status varchar)`,
        `CREATE TABLE payment ("orderId" int)`,
        `CREATE TABLE order_status_history_entry ("orderId" int)`,
        `CREATE TABLE settlement_order_link (id serial, "orderId" int, "orderErpId" varchar)`,
    ]) {
        await dataSource.query(ddl);
    }
    const managerOf = (c: RequestContext): EntityManager | undefined =>
        (c as unknown as { __manager?: EntityManager }).__manager;
    const connection = {
        withTransaction: async (
            c: RequestContext,
            work: (x: RequestContext) => Promise<unknown>,
        ) =>
            managerOf(c)
                ? work(c)
                : dataSource.transaction(manager =>
                      work({ ...c, __manager: manager } as unknown as RequestContext),
                  ),
        getRepository: (c: RequestContext, entity: unknown) => {
            const manager = managerOf(c) ?? dataSource.manager;
            return entity === Order
                ? manager.getRepository(TestOrder)
                : { query: manager.query.bind(manager) };
        },
    };
    service = new ExternalOrderRetentionService(
        connection as never,
        {
            getSettings: async () => ({ customFields: { externalOrderRetentionMonths: 12 } }),
        } as never,
    );
});

afterAll(async () => {
    await dataSource?.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    for (const table of [
        '"order"',
        'payment_attempt',
        'proforma_invoice',
        'payment',
        'order_status_history_entry',
        'settlement_order_link',
    ]) {
        await dataSource.query(`DELETE FROM ${table}`);
    }
});

describe('ExternalOrderRetentionService.sweep', () => {
    it('removes only a deletion-marked ERP order older than the window, with its history and link', async () => {
        const old = await insertOrder({ erpId: 'old' });
        const recent = await insertOrder({ erpId: 'recent', placed: daysAgo(30) });
        const unmarked = await insertOrder({ erpId: 'unmarked', marked: false });
        const unknownMark = await insertOrder({ erpId: 'null-mark', marked: null });
        const mivend = await insertOrder({ erpId: 'mivend', external: false });
        await dataSource.query(`INSERT INTO order_status_history_entry ("orderId") VALUES ($1)`, [
            old,
        ]);
        await dataSource.query(
            `INSERT INTO settlement_order_link ("orderId", "orderErpId") VALUES ($1, 'old')`,
            [old],
        );

        expect(await service.sweep(ctx)).toBe(1);

        expect(await exists(old)).toBe(false);
        for (const id of [recent, unmarked, unknownMark, mivend])
            expect(await exists(id)).toBe(true);
        expect(await dataSource.query('SELECT 1 FROM order_status_history_entry')).toHaveLength(0);
        expect(
            await dataSource.query('SELECT "orderId", "orderErpId" FROM settlement_order_link'),
        ).toEqual([{ orderId: null, orderErpId: 'old' }]);
    });

    it('never removes an order with an open payment attempt, open proforma invoice or payment', async () => {
        const withAttempt = await insertOrder({ erpId: 'a' });
        const withProforma = await insertOrder({ erpId: 'b' });
        const withPayment = await insertOrder({ erpId: 'c' });
        const closed = await insertOrder({ erpId: 'd' });
        await dataSource.query(`INSERT INTO payment_attempt VALUES ($1, 'pending')`, [withAttempt]);
        await dataSource.query(`INSERT INTO proforma_invoice VALUES ($1, 'issued')`, [
            withProforma,
        ]);
        await dataSource.query(`INSERT INTO payment VALUES ($1)`, [withPayment]);
        await dataSource.query(`INSERT INTO payment_attempt VALUES ($1, 'paid')`, [closed]);
        await dataSource.query(`INSERT INTO proforma_invoice VALUES ($1, 'cancelled')`, [closed]);

        expect(await service.sweep(ctx)).toBe(1);

        expect(await exists(closed)).toBe(false);
        for (const id of [withAttempt, withProforma, withPayment])
            expect(await exists(id)).toBe(true);
    });

    it('is idempotent and a concurrent sweep removes each order exactly once', async () => {
        for (let i = 0; i < 6; i += 1) await insertOrder({ erpId: `bulk-${i}` });

        const counts = await Promise.all([service.sweep(ctx), service.sweep(ctx)]);

        expect(counts[0] + counts[1]).toBe(6);
        expect(await service.sweep(ctx)).toBe(0);
        expect(await dataSource.query('SELECT 1 FROM "order"')).toHaveLength(0);
    });

    it('does not remove an order the ERP un-marked while the sweep was selecting it', async () => {
        const id = await insertOrder({ erpId: 'flip' });
        await dataSource.query(
            `UPDATE "order" SET "customFieldsErpmarkedfordeletion" = false WHERE id = $1`,
            [id],
        );
        expect(await service.sweep(ctx)).toBe(0);
        expect(await exists(id)).toBe(true);
    });
});
