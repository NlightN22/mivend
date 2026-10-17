import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { Order } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';
import type { SyncEventByType } from 'shared';

import { OrderSyncService } from '../../order-sync.service';

// Plain tables stand in for Vendure's order/customer/variant: only what applyCreate reads and writes.
const { schema, extra } = testSchemaOptions('sync_order_replica_apply');
let dataSource: DataSource;
let failNextLine = false;
let service: OrderSyncService;

const emOf = (ctx: unknown): EntityManager => (ctx as { em: EntityManager }).em;

const event = {
    payload: {
        sourceOrderId: 'central-order-1',
        orderCode: 'ORD-1',
        customerEmail: 'buyer@example.com',
        branchId: 'branch-a',
        lines: [{ sku: 'SKU-1', quantity: 1, unitPrice: 100 }],
    },
} as unknown as SyncEventByType<'order.created'>;

const countReplicas = async (): Promise<number> =>
    Number((await dataSource.query('SELECT count(*) AS n FROM "order"'))[0].n);

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
    });
    await dataSource.initialize();
    await dataSource.query(
        `CREATE TABLE "order" (id serial PRIMARY KEY, code text,
          "customFieldsSourceorderid" text, "customFieldsBranchid" text)`,
    );
    await dataSource.query('CREATE TABLE customer ("emailAddress" text, "userId" int)');
    await dataSource.query('CREATE TABLE product_variant (id int, sku text)');
    await dataSource.query(`INSERT INTO customer VALUES ('buyer@example.com', 7)`);
    await dataSource.query(`INSERT INTO product_variant VALUES (1, 'SKU-1')`);

    const base = createTestConnection(dataSource);
    const connection = {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (ctx: unknown, entity: unknown) =>
            entity === Order
                ? {
                      query: (sql: string, params?: unknown[]) => emOf(ctx).query(sql, params),
                      update: (
                          id: number,
                          values: { customFields: { sourceOrderId: string; branchId: string } },
                      ) =>
                          emOf(ctx).query(
                              `UPDATE "order" SET "customFieldsSourceorderid" = $2, "customFieldsBranchid" = $3 WHERE id = $1`,
                              [id, values.customFields.sourceOrderId, values.customFields.branchId],
                          ),
                  }
                : base.getRepository(ctx as never, entity as never),
    } as unknown as TransactionalConnection;
    const orderService = {
        create: async (ctx: unknown) => {
            const rows = await emOf(ctx).query(
                `INSERT INTO "order" (code) VALUES ('ORD-L') RETURNING id, code`,
            );
            return rows[0];
        },
        addItemToOrder: async () => {
            if (failNextLine) {
                failNextLine = false;
                throw new Error('line failed');
            }
        },
        transitionToState: async () => ({}),
    };
    service = new OrderSyncService(
        orderService as never,
        { create: async () => ({}) as RequestContext } as never,
        dataSource,
        {} as never,
        connection,
        {} as never,
    );
});

afterEach(async () => {
    failNextLine = false;
    await dataSource.query('DELETE FROM "order"');
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('OrderSyncService.applyCreate (integration, real Postgres)', () => {
    it('two parallel applies of one order.created produce a single replica', async () => {
        await Promise.all([service.applyCreate(event), service.applyCreate(event)]);

        expect(await countReplicas()).toBe(1);
    });

    it('a failure mid-apply leaves no half-built replica, and the retry produces exactly one', async () => {
        failNextLine = true;
        await expect(service.applyCreate(event)).rejects.toThrow('line failed');
        expect(await countReplicas()).toBe(0);

        await service.applyCreate(event);

        expect(await countReplicas()).toBe(1);
    });
});
