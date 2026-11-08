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
    seedAuth,
    FakeTarget,
    TestBatch,
    TestItem,
    buildStack,
    connectionFor,
    ctxFor,
    fakeExecutor,
    type Stack,
} from './bulk-harness';

const { schema, extra } = testSchemaOptions('bulk_batches');
const actor = ctxFor('user-7');
let dataSource: DataSource;

const outcomes = async (batchId: number): Promise<Record<string, string | null>> =>
    Object.fromEntries(
        (await dataSource.getRepository(TestItem).findBy({ batchId })).map(i => [
            i.targetId,
            i.outcome,
        ]),
    );
const targetRow = (id: string): Promise<FakeTarget | null> =>
    dataSource.getRepository(FakeTarget).findOneBy({ id: Number(id) });

async function runAndWait(stack: Stack, uuid: string): Promise<void> {
    await stack.batches.run(actor, uuid);
    await stack.runner.execute(actor, uuid);
}

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
    await dataSource.getRepository(FakeTarget).insert([{}, {}, {}, {}, { active: true }]);
});

describe('draft minting (preview)', () => {
    it('mints a numbered draft with verdicts and changes no business row', async () => {
        const stack = buildStack(
            connectionFor(dataSource),
            fakeExecutor(connectionFor(dataSource)),
        );
        const draft = await stack.batches.preview(actor, FAKE_TYPE, { action: 'activate' }, [
            '1',
            '2',
            '5',
            '99',
        ]);
        expect(draft.status).toBe('draft');
        expect(draft.uuid).toMatch(/^[0-9a-f-]{36}$/);
        expect(draft.number).toMatch(/^\d+$/);
        const items = await dataSource.getRepository(TestItem).findBy({ batchId: draft.id });
        expect(
            Object.fromEntries(
                items.map(i => [i.targetId, i.previewReasonCode ?? i.previewOutcome]),
            ),
        ).toEqual({
            '1': 'apply',
            '2': 'apply',
            '5': 'already_active',
            '99': 'not_found',
        });
        expect((await targetRow('1'))?.writes).toBe(0);
    });

    it('reuses one draft for the same actor, parameters and selection, whatever the id order', async () => {
        const stack = buildStack(
            connectionFor(dataSource),
            fakeExecutor(connectionFor(dataSource)),
        );
        const [a, b] = await Promise.all([
            stack.batches.preview(actor, FAKE_TYPE, {}, ['1', '2']),
            stack.batches.preview(actor, FAKE_TYPE, {}, ['2', '1', '1']),
        ]);
        expect(b.uuid).toBe(a.uuid);
        expect(await dataSource.getRepository(TestBatch).count()).toBe(1);
        const other = await stack.batches.preview(actor, FAKE_TYPE, { action: 'deactivate' }, [
            '1',
            '2',
        ]);
        expect(other.uuid).not.toBe(a.uuid);
        const otherActor = await stack.batches.preview(ctxFor('user-8'), FAKE_TYPE, {}, ['1', '2']);
        expect(otherActor.uuid).not.toBe(a.uuid);
    });

    it('refuses an empty selection, an oversized one and an actor without the permission', async () => {
        const stack = buildStack(
            connectionFor(dataSource),
            fakeExecutor(connectionFor(dataSource)),
        );
        await expect(stack.batches.preview(actor, FAKE_TYPE, {}, [])).rejects.toThrow(
            /at least one/i,
        );
        await expect(
            stack.batches.preview(
                actor,
                FAKE_TYPE,
                {},
                Array.from({ length: 1001 }, (_, i) => String(i)),
            ),
        ).rejects.toThrow(/At most/);
        await expect(
            stack.batches.preview(ctxFor('user-7', false), FAKE_TYPE, {}, ['1']),
        ).rejects.toThrow();
    });
});

describe('idempotency', () => {
    it('runs a batch twice, in parallel and again after it is done, with one effect per record', async () => {
        const executor = fakeExecutor(connectionFor(dataSource));
        const stack = buildStack(connectionFor(dataSource), executor);
        const draft = await stack.batches.preview(actor, FAKE_TYPE, {}, ['1', '2', '3']);
        await Promise.all([
            stack.batches.run(actor, draft.uuid),
            stack.batches.run(actor, draft.uuid),
        ]);
        await Promise.all([
            stack.runner.execute(actor, draft.uuid),
            stack.runner.execute(actor, draft.uuid),
        ]);
        await runAndWait(stack, draft.uuid);
        expect([...executor.applied].sort()).toEqual(['1', '2', '3']);
        expect((await targetRow('1'))?.writes).toBe(1);
        const done = await stack.queries.get(actor, draft.uuid);
        expect(done).toMatchObject({ status: 'done', visibleApplied: 3 });
    });

    it('only the creator can run a draft', async () => {
        const stack = buildStack(
            connectionFor(dataSource),
            fakeExecutor(connectionFor(dataSource)),
        );
        const draft = await stack.batches.preview(actor, FAKE_TYPE, {}, ['1']);
        await expect(stack.batches.run(ctxFor('user-8'), draft.uuid)).rejects.toThrow();
    });
});

describe('concurrency', () => {
    it('two batches over the same rows change each row once; the other batch skips it', async () => {
        const executor = fakeExecutor(connectionFor(dataSource), { applyDelayMs: 20 });
        const stack = buildStack(connectionFor(dataSource), executor);
        const a = await stack.batches.preview(actor, FAKE_TYPE, {}, ['1', '2', '3']);
        const b = await stack.batches.preview(actor, FAKE_TYPE, {}, ['3', '2', '1', '4']);
        await Promise.all([runAndWait(stack, a.uuid), runAndWait(stack, b.uuid)]);
        for (const id of ['1', '2', '3', '4']) expect((await targetRow(id))?.writes).toBe(1);
        const both = [
            ...Object.values(await outcomes(a.id)),
            ...Object.values(await outcomes(b.id)),
        ];
        expect(both.filter(o => o === 'applied')).toHaveLength(4);
        expect(both.filter(o => o === 'skipped')).toHaveLength(3);
    });
});

describe('partial failure', () => {
    it('applies the other records, records the failed one and ends partial', async () => {
        const executor = fakeExecutor(connectionFor(dataSource), { failOn: new Set(['2']) });
        const stack = buildStack(connectionFor(dataSource), executor);
        const draft = await stack.batches.preview(actor, FAKE_TYPE, {}, ['1', '2', '3']);
        await runAndWait(stack, draft.uuid);
        expect(await outcomes(draft.id)).toEqual({ '1': 'applied', '2': 'failed', '3': 'applied' });
        const failed = await dataSource
            .getRepository(TestItem)
            .findOneByOrFail({ batchId: draft.id, targetId: '2' });
        expect(failed.message).toBe('boom 2');
        expect(await stack.queries.get(actor, draft.uuid)).toMatchObject({
            status: 'partial',
            visibleApplied: 2,
            visibleFailed: 1,
        });
    });
});

describe('undo', () => {
    it('creates one linked batch with its own number, only for the applied records', async () => {
        const stack = buildStack(
            connectionFor(dataSource),
            fakeExecutor(connectionFor(dataSource)),
        );
        const draft = await stack.batches.preview(actor, FAKE_TYPE, {}, ['1', '2', '5']);
        await expect(stack.batches.undo(actor, draft.uuid)).rejects.toThrow(/finished/);
        await runAndWait(stack, draft.uuid);
        const [first, second] = [
            await stack.batches.undo(actor, draft.uuid),
            await stack.batches.undo(actor, draft.uuid),
        ];
        expect(second.uuid).toBe(first.uuid);
        expect(first.uuid).not.toBe(draft.uuid);
        expect(first.number).not.toBe(draft.number);
        expect(first.undoOfBatchId).toBe(draft.id);
        await stack.runner.execute(actor, first.uuid);
        expect((await targetRow('1'))?.active).toBe(false);
        expect((await targetRow('5'))?.active).toBe(true);
        expect(await dataSource.getRepository(TestBatch).countBy({ undoOfBatchId: draft.id })).toBe(
            1,
        );
    });
});
