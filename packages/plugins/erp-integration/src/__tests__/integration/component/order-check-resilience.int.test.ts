import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { EntityManager } from 'typeorm';
import type { RequestContext } from '@vendure/core';

import { createOrderChecksWorld, resetWorld } from './order-checks.harness';
import type { OrderChecksWorld } from './order-checks.harness';

// Real Postgres: savepoints, advisory locks and keyset pages cannot be proven by mocks.
let w: OrderChecksWorld;
const provider = { failing: false };

beforeAll(async () => {
    w = await createOrderChecksWorld('erp_order_check_resilience');
    w.stale.onModuleInit();
    w.registry.registerCheck({
        code: 'test.sql-error',
        subjectType: 'order',
        stages: ['pre-reserve'],
        description: 'throws a SQL error on demand',
        evaluate: async (_subject, { ctx }) => {
            if (provider.failing) {
                await (ctx as unknown as { em: EntityManager }).em.query('SELECT 1/0');
            }
            return [];
        },
    });
});
afterAll(async () => {
    await w?.close();
});
beforeEach(async () => {
    provider.failing = false;
    await resetWorld(w);
});

const failingOrder = async (): Promise<string> => {
    const orderId = await w.seedOrder([
        { sku: 'A', productErpId: 'p-1', organizationErpId: 'org-1', quantity: 5 },
    ]);
    await w.seedAssignment('p-1', 'org-1');
    return orderId;
};

describe('a failing check cannot break the order flow', () => {
    it('a provider SQL error does not poison the surrounding transaction and is counted in health', async () => {
        const orderId = await failingOrder();
        provider.failing = true;

        await w.dataSource.transaction(async em => {
            const txCtx = { em, activeUserId: 'user-1' } as unknown as RequestContext;
            await em.query(`UPDATE "order" SET code = 'RESERVED-MARK' WHERE id = $1`, [orderId]);

            expect(await w.orderChecks.isHeld(txCtx, orderId, 'auto-trust-rule')).toBe(false);

            await em.query('SELECT 1');
        });

        const [order] = await w.dataSource.query(`SELECT code FROM "order" WHERE id = $1`, [
            orderId,
        ]);
        expect(order.code).toBe('RESERVED-MARK');
        await new Promise(r => setTimeout(r, 200));
        const health = await w.health.getHealth();
        expect(health).toContainEqual({
            checkCode: 'check-run-failed',
            reason: 'pre-reserve',
            orderCount: 1,
            staleOrderCount: 0,
        });
    });
});

describe('concurrent runs of one order', () => {
    it('leave exactly one result set and stay fast', async () => {
        const orderId = await failingOrder();
        await w.orderChecks.run(w.ctx, orderId, 'pre-reserve');
        const single = (await w.results(orderId)).length;
        expect(single).toBeGreaterThan(0);

        const started = Date.now();
        await Promise.all(
            Array.from({ length: 6 }, () => w.orderChecks.run(w.ctx, orderId, 'pre-reserve')),
        );
        const elapsed = Date.now() - started;

        const rows = await w.results(orderId);
        expect(rows).toHaveLength(single);
        const [dupes] = await w.dataSource.query(
            `SELECT COUNT(*)::int AS n FROM (
                SELECT 1 FROM check_result WHERE "subjectId" = $1
                GROUP BY "subjectType", "subjectId", stage, "checkCode", COALESCE("lineRef", '')
                HAVING COUNT(*) > 1) d`,
            [orderId],
        );
        expect(dupes.n).toBe(0);
        expect(elapsed).toBeLessThan(5000);
    });
});

describe('stale marking without a cap', () => {
    it('flags every candidate order across several pages', async () => {
        const total = 450;
        for (let i = 0; i < total; i += 1) {
            await w.seedOrder([
                { sku: `S${i}`, productErpId: 'p-1', organizationErpId: 'org-1', quantity: 1 },
            ]);
        }
        await w.dataSource.query(
            `INSERT INTO check_result (uuid, "subjectType", "subjectId", "checkCode", stage, severity,
                                       "messageKey", facts, "computedAt", stale)
             SELECT gen_random_uuid(), 'order', id::text, 'erp.organization-stock', 'pre-reserve',
                    'error', 'x', '{}', now(), false FROM "order"`,
        );

        expect(await w.stale.markForProducts(w.ctx, ['p-1'])).toBe(total);

        const [left] = await w.dataSource.query(
            `SELECT COUNT(*)::int AS n FROM check_result WHERE stale = false`,
        );
        expect(left.n).toBe(0);
    }, 120_000);
});

describe('stale requests', () => {
    it('a request written with the data change marks every candidate order later, and is then gone', async () => {
        const orderId = await failingOrder();
        await w.orderChecks.run(w.ctx, orderId, 'pre-reserve');

        await w.stale.requestForProducts(w.ctx, ['p-1', 'p-1']);
        expect(await w.dataSource.query('SELECT 1 FROM check_stale_request')).toHaveLength(1);
        expect((await w.results(orderId)).some(r => r['stale'])).toBe(false);

        await w.requests.drain(w.ctx);

        expect((await w.results(orderId)).every(r => r['stale'])).toBe(true);
        expect(await w.dataSource.query('SELECT 1 FROM check_stale_request')).toHaveLength(0);
    });

    it('a request repeated while it is being processed is kept for the next pass', async () => {
        const orderId = await failingOrder();
        await w.orderChecks.run(w.ctx, orderId, 'pre-reserve');
        await w.stale.requestForProducts(w.ctx, ['p-1']);
        w.requests.registerHandler('order-product', async () => {
            await w.stale.requestForProducts(w.ctx, ['p-1']);
        });

        await w.requests.drain(w.ctx);

        expect(await w.dataSource.query('SELECT 1 FROM check_stale_request')).toHaveLength(1);
    });
});
