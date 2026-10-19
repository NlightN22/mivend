import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource, EntityManager } from 'typeorm';
import type { Injector, Order, RequestContext } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { SerializedActiveOrderStrategy } from '../../serialized-active-order.strategy';

interface TestCtx {
    em?: EntityManager;
    activeUserId?: number;
    channelId: number;
    session: { activeOrderId?: number };
}

const { schema, extra } = testSchemaOptions('serialized_active_order');
let dataSource: DataSource;
let strategy: SerializedActiveOrderStrategy;

const query = (
    ctx: TestCtx,
    sql: string,
    params?: unknown[],
): Promise<Array<Record<string, number>>> => (ctx.em ?? dataSource.manager).query(sql, params);

// Stand-in for DefaultActiveOrderStrategy: session order first, then the user's newest active order.
const inner = {
    determineActiveOrder: async (raw: RequestContext): Promise<Order | undefined> => {
        const ctx = raw as unknown as TestCtx;
        const rows = ctx.session.activeOrderId
            ? await query(ctx, 'SELECT id FROM "order" WHERE id = $1 AND active', [
                  ctx.session.activeOrderId,
              ])
            : ctx.activeUserId
              ? await query(
                    ctx,
                    'SELECT id FROM "order" WHERE active AND "userId" = $1 ORDER BY id DESC LIMIT 1',
                    [ctx.activeUserId],
                )
              : [];
        return rows[0] as unknown as Order | undefined;
    },
    createActiveOrder: async (raw: RequestContext): Promise<Order> => {
        const ctx = raw as unknown as TestCtx;
        const rows = await query(
            ctx,
            'INSERT INTO "order" (active, "userId") VALUES (true, $1) RETURNING id',
            [ctx.activeUserId],
        );
        return rows[0] as unknown as Order;
    },
};

const connection = {
    withTransaction: (ctx: TestCtx, work: (c: TestCtx) => Promise<unknown>) =>
        ctx.em ? work(ctx) : dataSource.transaction(em => work({ ...ctx, em })),
    getRepository: (ctx: TestCtx) => ({
        manager: ctx.em ?? dataSource.manager,
        query: (sql: string, params?: unknown[]) => query(ctx, sql, params),
    }),
};

function inTx<T>(base: Omit<TestCtx, 'em'>, work: (ctx: RequestContext) => Promise<T>): Promise<T> {
    return dataSource.transaction(em => work({ ...base, em } as unknown as RequestContext));
}

async function addItem(ctx: RequestContext, variantId: number, log: string[]): Promise<void> {
    const order =
        (await strategy.determineActiveOrder(ctx)) ?? (await strategy.createActiveOrder(ctx));
    log.push(`add:${variantId}`);
    const c = ctx as unknown as TestCtx;
    const lines = await query(c, 'SELECT id FROM order_line WHERE "orderId" = $1 ORDER BY id', [
        order.id,
    ]);
    for (const line of lines) {
        await query(c, 'UPDATE order_line SET quantity = quantity WHERE id = $1', [line.id]);
    }
    const updated = await query(
        c,
        'UPDATE order_line SET quantity = quantity + 1 WHERE "orderId" = $1 AND "variantId" = $2 RETURNING id',
        [order.id, variantId],
    );
    if (updated.length === 0) {
        await query(
            c,
            'INSERT INTO order_line ("orderId", "variantId", quantity) VALUES ($1, $2, 1)',
            [order.id, variantId],
        );
    }
}

async function removeAll(ctx: RequestContext, log: string[]): Promise<void> {
    const order = await strategy.determineActiveOrder(ctx);
    if (!order) return;
    log.push('removeAll');
    const c = ctx as unknown as TestCtx;
    const lines = await query(
        c,
        'SELECT id FROM order_line WHERE "orderId" = $1 ORDER BY id DESC',
        [order.id],
    );
    for (const line of lines) {
        await query(c, 'DELETE FROM order_line WHERE id = $1', [line.id]);
        await query(c, 'SELECT pg_sleep(0.005)');
    }
}

function replay(log: string[]): Record<number, number> {
    const lines: Record<number, number> = {};
    for (const op of log) {
        if (op === 'removeAll') Object.keys(lines).forEach(k => delete lines[Number(k)]);
        else {
            const v = Number(op.split(':')[1]);
            lines[v] = (lines[v] ?? 0) + 1;
        }
    }
    return lines;
}

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
        'CREATE TABLE "order" (id serial PRIMARY KEY, active boolean NOT NULL, "userId" int)',
    );
    await dataSource.query(
        'CREATE TABLE order_line (id serial PRIMARY KEY, "orderId" int NOT NULL REFERENCES "order"(id), "variantId" int NOT NULL, quantity int NOT NULL)',
    );
    strategy = new SerializedActiveOrderStrategy(inner);
    await strategy.init({ get: () => connection } as unknown as Injector);
});

afterAll(async () => {
    await dataSource?.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query('TRUNCATE order_line, "order" RESTART IDENTITY');
});

describe('SerializedActiveOrderStrategy (#258)', () => {
    it('serializes concurrent adds and removeAll on one order without deadlocks', async () => {
        const [{ id }] = await dataSource.query(
            'INSERT INTO "order" (active, "userId") VALUES (true, 1) RETURNING id',
        );
        for (let v = 1; v <= 5; v++) {
            await dataSource.query(
                'INSERT INTO order_line ("orderId", "variantId", quantity) VALUES ($1, $2, 1)',
                [id, v],
            );
        }
        const log: string[] = ['add:1', 'add:2', 'add:3', 'add:4', 'add:5'];
        const base = { activeUserId: 1, channelId: 1, session: { activeOrderId: id } };
        const ops = Array.from({ length: 24 }, (_, i) =>
            inTx(base, ctx => (i % 4 === 3 ? removeAll(ctx, log) : addItem(ctx, (i % 5) + 1, log))),
        );

        const results = await Promise.allSettled(ops);

        expect(results.filter(r => r.status === 'rejected')).toEqual([]);
        const rows: Array<{ variantId: number; quantity: number }> = await dataSource.query(
            'SELECT "variantId", quantity FROM order_line WHERE "orderId" = $1',
            [id],
        );
        expect(Object.fromEntries(rows.map(r => [r.variantId, r.quantity]))).toEqual(replay(log));
    });

    it('creates exactly one active order for concurrent first adds of one customer', async () => {
        const base = { activeUserId: 7, channelId: 1, session: {} };
        const results = await Promise.allSettled(
            Array.from({ length: 10 }, (_, i) => inTx(base, ctx => addItem(ctx, i + 1, []))),
        );

        expect(results.filter(r => r.status === 'rejected')).toEqual([]);
        const orders = await dataSource.query(
            'SELECT id FROM "order" WHERE active AND "userId" = 7',
        );
        expect(orders).toHaveLength(1);
        const [{ count }] = await dataSource.query('SELECT count(*)::int AS count FROM order_line');
        expect(count).toBe(10);
    });

    it('does not lock or wait outside a transaction', async () => {
        const [{ id }] = await dataSource.query(
            'INSERT INTO "order" (active, "userId") VALUES (true, 1) RETURNING id',
        );
        let release!: () => void;
        const held = new Promise<void>(r => (release = r));
        let locked!: () => void;
        const isLocked = new Promise<void>(r => (locked = r));
        const holder = inTx(
            { activeUserId: 1, channelId: 1, session: { activeOrderId: id } },
            async ctx => {
                await strategy.determineActiveOrder(ctx);
                locked();
                await held;
            },
        );
        await isLocked;

        const read = await strategy.determineActiveOrder({
            activeUserId: 1,
            channelId: 1,
            session: { activeOrderId: id },
        } as unknown as RequestContext);

        expect(read?.id).toBe(id);
        release();
        await holder;
    });
});
