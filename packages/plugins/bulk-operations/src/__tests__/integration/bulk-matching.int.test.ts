import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { MAX_SELECTION } from '../../types';
import {
    FAKE_TYPE,
    FakeTarget,
    TestBatch,
    TestItem,
    buildStack,
    connectionFor,
    ctxFor,
    fakeExecutor,
    seedAuth,
} from './bulk-harness';

const { schema, extra } = testSchemaOptions('bulk_matching');
const actor = ctxFor('user-7');
let dataSource: DataSource;

const itemIds = async (batchId: number): Promise<string[]> =>
    (await dataSource.getRepository(TestItem).findBy({ batchId })).map(i => i.targetId).sort();

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
    await seedAuth(dataSource);
    await dataSource
        .getRepository(FakeTarget)
        .insert(Array.from({ length: 12 }, (_, i) => ({ active: i >= 10 })));
});

describe('draft from a filter (previewMatching)', () => {
    it('snapshots the matching ids server-side and the run processes exactly that snapshot', async () => {
        const stack = buildStack(
            connectionFor(dataSource),
            fakeExecutor(connectionFor(dataSource)),
        );
        const draft = await stack.batches.previewMatching(actor, FAKE_TYPE, {}, { active: false });
        expect(draft.totalCount).toBe(10);
        expect(await itemIds(draft.id)).toEqual(
            Array.from({ length: 10 }, (_, i) => String(i + 1)).sort(),
        );
        // A row that starts matching after the draft is not part of the batch.
        await dataSource.query('UPDATE fake_target SET active = false WHERE id = 11');
        await stack.batches.run(actor, draft.uuid);
        await stack.runner.execute(actor, draft.uuid);
        expect(
            (await dataSource.getRepository(TestItem).findBy({ batchId: draft.id })).length,
        ).toBe(10);
        expect((await dataSource.getRepository(FakeTarget).findOneBy({ id: 11 }))?.writes).toBe(0);
    });

    it('never includes a record outside the actor scope', async () => {
        const outside = new Set(['2', '4']);
        const stack = buildStack(
            connectionFor(dataSource),
            fakeExecutor(connectionFor(dataSource), { visible: id => !outside.has(id) }),
        );
        const draft = await stack.batches.previewMatching(actor, FAKE_TYPE, {}, { active: false });
        expect(draft.totalCount).toBe(8);
        expect(await itemIds(draft.id)).not.toContain('2');
    });

    it('refuses a filter that matches more than the cap, and an empty match', async () => {
        await dataSource
            .getRepository(FakeTarget)
            .insert(Array.from({ length: MAX_SELECTION }, () => ({})));
        const stack = buildStack(
            connectionFor(dataSource),
            fakeExecutor(connectionFor(dataSource)),
        );
        await expect(stack.batches.previewMatching(actor, FAKE_TYPE, {}, {})).rejects.toThrow(
            /narrow the filter/,
        );
        await dataSource.query('TRUNCATE fake_target RESTART IDENTITY');
        await expect(stack.batches.previewMatching(actor, FAKE_TYPE, {}, {})).rejects.toThrow(
            /No records match/,
        );
        expect(await dataSource.getRepository(TestBatch).count()).toBe(0);
    });

    it('requires the operation permission and a filter-capable executor', async () => {
        const stack = buildStack(
            connectionFor(dataSource),
            fakeExecutor(connectionFor(dataSource)),
        );
        await expect(
            stack.batches.previewMatching(ctxFor('user-7', false), FAKE_TYPE, {}, {}),
        ).rejects.toThrow();
        const plain = fakeExecutor(connectionFor(dataSource));
        delete plain.resolveMatching;
        const noFilter = buildStack(connectionFor(dataSource), plain);
        await expect(noFilter.batches.previewMatching(actor, FAKE_TYPE, {}, {})).rejects.toThrow(
            /cannot select by filter/,
        );
    });

    it('is idempotent: the same filter twice, also in parallel, reuses one draft', async () => {
        const stack = buildStack(
            connectionFor(dataSource),
            fakeExecutor(connectionFor(dataSource)),
        );
        const first = await stack.batches.previewMatching(actor, FAKE_TYPE, {}, { active: false });
        const again = await stack.batches.previewMatching(actor, FAKE_TYPE, {}, { active: false });
        expect(again.uuid).toBe(first.uuid);
        const parallel = await Promise.all(
            Array.from({ length: 4 }, () =>
                stack.batches.previewMatching(actor, FAKE_TYPE, {}, { active: true }),
            ),
        );
        expect(new Set(parallel.map(b => b.uuid)).size).toBe(1);
        expect(await dataSource.getRepository(TestBatch).count()).toBe(2);
    });

    it('two actors drafting the same filter get their own drafts', async () => {
        const stack = buildStack(
            connectionFor(dataSource),
            fakeExecutor(connectionFor(dataSource)),
        );
        const [a, b] = await Promise.all([
            stack.batches.previewMatching(ctxFor('user-7'), FAKE_TYPE, {}, {}),
            stack.batches.previewMatching(ctxFor('user-8'), FAKE_TYPE, {}, {}),
        ]);
        expect(a.uuid).not.toBe(b.uuid);
        expect(a.totalCount).toBe(12);
    });
});
