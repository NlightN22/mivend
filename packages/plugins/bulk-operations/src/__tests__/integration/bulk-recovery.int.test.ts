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
    seedAuth,
} from './bulk-harness';

const { schema, extra } = testSchemaOptions('bulk_recovery');
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
    await seedAuth(dataSource);
});

const age = (uuid: string, minutes: number): Promise<unknown> =>
    dataSource.query(
        `UPDATE bulk_batch SET status = 'running', "updatedAt" = now() - make_interval(mins => $2) WHERE uuid = $1`,
        [uuid, minutes],
    );

describe('recovery of a run whose worker died', () => {
    it('reclaims a stale running batch and finishes only the remaining items', async () => {
        const connection = connectionFor(dataSource);
        const executor = fakeExecutor(connection);
        const stack = buildStack(connection, executor);
        const draft = await stack.batches.preview(actor, FAKE_TYPE, {}, ['1', '2', '3']);
        await stack.batches.run(actor, draft.uuid);
        stack.enqueued.length = 0;
        await dataSource.query(`UPDATE fake_target SET active = true, writes = 1 WHERE id = 1`);
        await dataSource.query(
            `UPDATE bulk_batch_item SET outcome = 'applied' WHERE "targetId" = '1'`,
        );
        await age(draft.uuid, 11);

        await stack.batches.run(actor, draft.uuid);
        expect(stack.enqueued).toEqual([draft.uuid]);
        await stack.runner.execute(actor, draft.uuid);
        expect([...executor.applied].sort()).toEqual(['2', '3']);
        expect((await dataSource.getRepository(FakeTarget).findOneByOrFail({ id: 1 })).writes).toBe(
            1,
        );
        expect((await stack.queries.get(actor, draft.uuid)).status).toBe('done');
    });

    it('does not reclaim a fresh running batch', async () => {
        const connection = connectionFor(dataSource);
        const executor = fakeExecutor(connection);
        const stack = buildStack(connection, executor);
        const draft = await stack.batches.preview(actor, FAKE_TYPE, {}, ['1', '2']);
        await stack.batches.run(actor, draft.uuid);
        stack.enqueued.length = 0;
        await age(draft.uuid, 1);
        await stack.batches.run(actor, draft.uuid);
        await stack.runner.execute(actor, draft.uuid);
        expect(stack.enqueued).toEqual([]);
        expect(executor.applied).toEqual([]);
    });
});

describe('rights are re-read from the database for each chunk', () => {
    it('skips the pending records when the creator lost the permission after queueing', async () => {
        const connection = connectionFor(dataSource);
        const executor = fakeExecutor(connection);
        const stack = buildStack(connection, executor);
        const draft = await stack.batches.preview(actor, FAKE_TYPE, {}, ['1', '2']);
        await stack.batches.run(actor, draft.uuid);
        await dataSource.query(`UPDATE role SET permissions = 'ReadX'`);
        await stack.runner.execute(actor, draft.uuid);
        expect(executor.applied).toEqual([]);
        const items = await dataSource.getRepository(TestItem).findBy({ batchId: draft.id });
        expect(items.map(i => [i.outcome, i.reasonCode])).toEqual([
            ['skipped', 'actor_not_allowed'],
            ['skipped', 'actor_not_allowed'],
        ]);
    });

    it('ends done, not stopped, when the right is lost after the last record was applied', async () => {
        const connection = connectionFor(dataSource);
        const stack = buildStack(connection, fakeExecutor(connection));
        const draft = await stack.batches.preview(actor, FAKE_TYPE, {}, ['1']);
        await stack.batches.run(actor, draft.uuid);
        await dataSource.query(
            `UPDATE bulk_batch_item SET outcome = 'applied' WHERE "batchId" = $1`,
            [draft.id],
        );
        await dataSource.query(`UPDATE role SET permissions = 'ReadX'`);
        await stack.runner.execute(actor, draft.uuid);
        const batch = await stack.queries.get(actor, draft.uuid);
        expect(batch.status).toBe('done');
        expect(batch.errorMessage).toBeNull();
    });

    it('skips the pending records when the administrator was deactivated', async () => {
        const connection = connectionFor(dataSource);
        const executor = fakeExecutor(connection);
        const stack = buildStack(connection, executor);
        const draft = await stack.batches.preview(actor, FAKE_TYPE, {}, ['1']);
        await stack.batches.run(actor, draft.uuid);
        await dataSource.query(`UPDATE administrator SET "deletedAt" = now() WHERE id = 7`);
        await stack.runner.execute(actor, draft.uuid);
        expect(executor.applied).toEqual([]);
    });
});

describe('channel of the rights check', () => {
    it('ignores a role that is not assigned to the job channel', async () => {
        const connection = connectionFor(dataSource);
        const executor = fakeExecutor(connection);
        const stack = buildStack(connection, executor);
        const draft = await stack.batches.preview(actor, FAKE_TYPE, {}, ['1']);
        await stack.batches.run(actor, draft.uuid);
        await dataSource.query('UPDATE role_channels_channel SET "channelId" = 2');
        await stack.runner.execute(actor, draft.uuid);
        expect(executor.applied).toEqual([]);
    });
});

describe('undo with an abandoned draft of another actor', () => {
    it('lets the first actor undo while a foreign draft is left open, and keeps one non-draft undo', async () => {
        const connection = connectionFor(dataSource);
        const stack = buildStack(connection, fakeExecutor(connection));
        const original = await stack.batches.preview(actor, FAKE_TYPE, {}, ['1', '2']);
        await stack.batches.run(actor, original.uuid);
        await stack.runner.execute(actor, original.uuid);

        const other = ctxFor('user-8');
        await stack.batches.preview(
            other,
            FAKE_TYPE,
            { action: 'deactivate' },
            ['1', '2'],
            original.id,
        );

        const undone = await stack.batches.undo(actor, original.uuid);
        expect(undone.createdById).toBe('7');
        expect(undone.status).toBe('queued');
        const again = await stack.batches.undo(other, original.uuid);
        expect(again.uuid).toBe(undone.uuid);
        const nonDraft = await dataSource.query(
            `SELECT count(*)::int AS n FROM bulk_batch WHERE "undoOfBatchId" = $1 AND status <> 'draft'`,
            [original.id],
        );
        expect(nonDraft[0].n).toBe(1);
    });
});
