import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource, EntityManager } from 'typeorm';
import type { RequestContext } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { ErpReconciliationNotFound } from '../../../entities/erp-reconciliation-not-found.entity';
import { ErpReconciliationState } from '../../../entities/erp-reconciliation-state.entity';
import { ReconciliationLocalCountsService } from '../../../reconciliation-local-counts.service';
import { ReconciliationLocalIdsService } from '../../../reconciliation-local-ids.service';
import { ReconciliationStateService } from '../../../reconciliation-state.service';
import { HEAL_RETRY_AFTER_MS } from '../../../reconciliation-heal-policy';

const { schema, extra } = testSchemaOptions('erp_reconciliation_state');
let dataSource: DataSource;
let states: ReconciliationStateService;
let counts: ReconciliationLocalCountsService;
let localIds: ReconciliationLocalIdsService;
const ctx = {} as RequestContext;
const T0 = new Date('2026-11-20T00:00:00Z');
const quiet = { inboxBacklog: 0, inboxFailed: 0, sourceQueue: 0 };

const insertOrder = (erpId: string | null, marked: boolean | null): Promise<unknown> =>
    dataSource.query(
        `INSERT INTO "order" ("customFieldsErporderid", "customFieldsErpmarkedfordeletion") VALUES ($1, $2)`,
        [erpId, marked],
    );

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [ErpReconciliationState, ErpReconciliationNotFound],
        synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(
        `CREATE TABLE "order" (id serial primary key, "customFieldsErporderid" varchar, "customFieldsErpmarkedfordeletion" boolean)`,
    );
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
            return typeof entity === 'string'
                ? { query: manager.query.bind(manager) }
                : manager.getRepository(entity as never);
        },
    };
    states = new ReconciliationStateService(connection as never);
    counts = new ReconciliationLocalCountsService(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        connection as never,
    );
    localIds = new ReconciliationLocalIdsService(connection as never);
});

afterAll(async () => {
    await dataSource?.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query(
        'TRUNCATE "order", erp_reconciliation_state, erp_reconciliation_not_found RESTART IDENTITY',
    );
});

describe('customer-order local count and ids', () => {
    it('counts every stored order that is not marked for deletion, whatever its other state', async () => {
        await insertOrder('a', null);
        await insertOrder('b', false);
        await insertOrder('c', true);
        await insertOrder(null, null);
        expect(await counts.getLocalActiveCount(ctx, 'customer-order')).toBe(2);
    });

    it('lists stored ids in C collation with keyset paging', async () => {
        for (const id of ['b', 'B', 'a', 'c']) await insertOrder(id, id === 'c' ? true : null);
        await insertOrder(null, null);
        expect(await localIds.idPage(ctx, 'customer-order', null, 2)).toEqual(['B', 'a']);
        expect(await localIds.idPage(ctx, 'customer-order', 'a', 10)).toEqual(['b', 'c']);
    });
});

describe('comparison state table', () => {
    it('stores the first gap, then converges and stalls over consecutive runs', async () => {
        const at = (h: number): Date => new Date(T0.getTime() + h * 3_600_000);
        const run = (theirCount: number, h: number): Promise<ErpReconciliationState> =>
            states.record(ctx, {
                aggregateType: 'customer-order',
                ourCount: 100,
                theirCount,
                signals: quiet,
                now: at(h),
            });
        expect(await run(110, 0)).toMatchObject({ state: 'seeding', gap: 10 });
        expect(await run(105, 24)).toMatchObject({ state: 'converging', gap: 5 });
        expect(await run(105, 48)).toMatchObject({ state: 'seeding', flatRuns: 1 });
        expect(await run(105, 72)).toMatchObject({ flatRuns: 2 });
        expect(await run(105, 96)).toMatchObject({ state: 'stalled', flatRuns: 3 });
        expect(await dataSource.getRepository(ErpReconciliationState).count()).toBe(1);
        expect(await run(100, 120)).toMatchObject({ state: 'in-sync', healAttempts: 0 });
    });

    it('keeps one row when runs for the same aggregate overlap', async () => {
        await Promise.all(
            Array.from({ length: 6 }, (_, i) =>
                states.record(ctx, {
                    aggregateType: 'unit',
                    ourCount: 1,
                    theirCount: 2,
                    signals: quiet,
                    now: new Date(T0.getTime() + i),
                }),
            ),
        );
        expect(await dataSource.getRepository(ErpReconciliationState).count()).toBe(1);
        const [row] = await dataSource.getRepository(ErpReconciliationState).find();
        expect(row.flatRuns).toBe(0);
    });
});

describe('heal claim', () => {
    const stall = async (): Promise<void> => {
        await states.record(ctx, {
            aggregateType: 'customer-order',
            ourCount: 1,
            theirCount: 2,
            signals: quiet,
            now: T0,
        });
        await dataSource.query(`UPDATE erp_reconciliation_state SET state = 'stalled'`);
    };

    it('lets exactly one of several concurrent runners claim the healing', async () => {
        await stall();
        const now = new Date(T0.getTime() + HEAL_RETRY_AFTER_MS * 2);
        const decisions = await Promise.all(
            Array.from({ length: 8 }, () => states.claimHeal(ctx, 'customer-order', now, false)),
        );
        expect(decisions.filter(d => d.heal)).toHaveLength(1);
        expect(decisions.filter(d => !d.heal).every(d => !d.heal && d.reason === 'too-soon')).toBe(
            true,
        );
    });

    it('counts failures, keeps the counter on neutral outcomes and leaves it on success (judged by the next quiet comparison)', async () => {
        await stall();
        const finish = (
            outcome: 'batch-failed' | 'dry-run-only' | 'healed',
            success = false,
        ): Promise<ErpReconciliationState> =>
            states.finishHeal(ctx, 'customer-order', {
                outcome,
                detail: 'x',
                realRun: true,
                success,
            });
        expect((await finish('batch-failed')).healAttempts).toBe(1);
        expect((await finish('dry-run-only')).healAttempts).toBe(1);
        expect((await finish('batch-failed')).healAttempts).toBe(2);
        expect((await finish('healed', true)).healAttempts).toBe(2);
    });

    it('does not lose attempts when two failures are recorded at once', async () => {
        await stall();
        await Promise.all(
            Array.from({ length: 3 }, () =>
                states.finishHeal(ctx, 'customer-order', {
                    outcome: 'batch-failed',
                    detail: 'x',
                    realRun: true,
                    success: false,
                }),
            ),
        );
        const [row] = await dataSource.getRepository(ErpReconciliationState).find();
        expect(row.healAttempts).toBe(3);
    });
});

describe('not_found memory', () => {
    it('stores each id once per aggregate even when remembered twice at once', async () => {
        await Promise.all([
            states.rememberNotFound(ctx, 'customer-order', ['a', 'b']),
            states.rememberNotFound(ctx, 'customer-order', ['b', 'c']),
        ]);
        expect(await states.knownNotFound(ctx, 'customer-order', ['a', 'c', 'z'])).toEqual(
            new Set(['a', 'c']),
        );
        expect(await states.countNotFound(ctx, 'customer-order')).toBe(3);
        expect(await states.countNotFound(ctx, 'unit')).toBe(0);
    });
});
