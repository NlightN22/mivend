import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import {
    FAKE_TYPE,
    FakeTarget,
    TestBatch,
    TestItem,
    buildStack,
    connectionFor,
    ctxFor,
    fakeExecutor,
} from './bulk-harness';

const { schema, extra } = testSchemaOptions('bulk_history_scope');
const actor = ctxFor('user-7');
let dataSource: DataSource;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestBatch, TestItem, FakeTarget],
        synchronize: true,
    });
    await dataSource.initialize();
});
afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});
beforeEach(async () => {
    await dataSource.query('TRUNCATE bulk_batch, bulk_batch_item, fake_target RESTART IDENTITY');
    await dataSource.getRepository(FakeTarget).insert([{}, {}, {}, {}]);
});

describe('scope', () => {
    it('skips a record outside the actor scope and never changes it', async () => {
        const hidden = new Set(['3', '4']);
        const connection = connectionFor(dataSource);
        const stack = buildStack(
            connection,
            fakeExecutor(connection, { visible: id => !hidden.has(id) }),
        );
        const draft = await stack.batches.preview(actor, FAKE_TYPE, {}, ['1', '2', '3', '4']);
        await stack.batches.run(actor, draft.uuid);
        await stack.runner.execute(actor, draft.uuid);
        const rows = await dataSource.getRepository(FakeTarget).find({ order: { id: 'ASC' } });
        expect(rows.map(r => r.writes)).toEqual([1, 1, 0, 0]);
        const items = await dataSource.getRepository(TestItem).findBy({ batchId: draft.id });
        expect(
            items.filter(i => hidden.has(i.targetId)).map(i => [i.outcome, i.reasonCode]),
        ).toEqual([
            ['skipped', 'out_of_scope'],
            ['skipped', 'out_of_scope'],
        ]);
    });

    it('shows a viewer counters and result rows only for the records in their scope', async () => {
        const connection = connectionFor(dataSource);
        const full = buildStack(connection, fakeExecutor(connection));
        const draft = await full.batches.preview(actor, FAKE_TYPE, {}, ['1', '2', '3', '4']);
        await full.batches.run(actor, draft.uuid);
        await full.runner.execute(actor, draft.uuid);

        const narrow = buildStack(
            connection,
            fakeExecutor(connection, { visible: id => id === '1' || id === '2' }),
        );
        const seen = await narrow.queries.get(actor, draft.uuid);
        expect(seen).toMatchObject({ visibleCount: 2, visibleApplied: 2 });
        const items = await narrow.queries.items(actor, draft.uuid);
        expect(items.items.map(i => i.targetId).sort()).toEqual(['1', '2']);
        expect(items.totalItems).toBe(2);
        const list = await narrow.queries.list(actor);
        expect(list.items[0].visibleCount).toBe(2);
    });
});

describe('history list', () => {
    it('lists finished batches only, newest first, filtered, sorted and clamped, bound parameters only', async () => {
        const connection = connectionFor(dataSource);
        const stack = buildStack(connection, fakeExecutor(connection));
        const first = await stack.batches.preview(actor, FAKE_TYPE, {}, ['1']);
        await stack.batches.run(actor, first.uuid);
        await stack.runner.execute(actor, first.uuid);
        const second = await stack.batches.preview(actor, FAKE_TYPE, {}, ['2']);
        await stack.batches.run(actor, second.uuid);
        await stack.batches.preview(actor, FAKE_TYPE, {}, ['3']);

        const all = await stack.queries.list(actor);
        expect(all.items.map(b => b.number)).toEqual([second.number, first.number]);
        expect(all.totalItems).toBe(2);
        const done = await stack.queries.list(actor, { filter: { status: 'done' } });
        expect(done.items.map(b => b.uuid)).toEqual([first.uuid]);
        const sorted = await stack.queries.list(actor, {
            sort: { field: 'number', direction: 'ASC' },
        });
        expect(sorted.items.map(b => b.uuid)).toEqual([first.uuid, second.uuid]);
        const injected = await stack.queries.list(actor, { filter: { status: "done' OR '1'='1" } });
        expect(injected.items).toEqual([]);
        const unknownSort = await stack.queries.list(actor, {
            sort: { field: 'x; DROP TABLE bulk_batch', direction: 'ASC' },
        });
        expect(unknownSort.totalItems).toBe(2);
        expect((await stack.queries.list(actor, { take: 100000, skip: -5 })).items).toHaveLength(2);
    });

    it('hides batches of an operation the viewer may not run and another actor draft', async () => {
        const connection = connectionFor(dataSource);
        const stack = buildStack(connection, fakeExecutor(connection));
        const draft = await stack.batches.preview(actor, FAKE_TYPE, {}, ['1']);
        await expect(stack.queries.get(ctxFor('user-8'), draft.uuid)).rejects.toThrow();
        const noPermission = ctxFor('user-7', false);
        expect((await stack.queries.list(noPermission)).items).toEqual([]);
        await expect(stack.queries.get(noPermission, draft.uuid)).rejects.toThrow();
    });
});
