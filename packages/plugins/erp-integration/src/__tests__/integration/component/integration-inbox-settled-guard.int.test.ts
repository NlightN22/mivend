import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { IntegrationInboxEvent } from '../../../entities/integration-inbox-event.entity';
import { IntegrationInboxService } from '../../../integration-inbox.service';

let dataSource: DataSource;
let inbox: IntegrationInboxService;
const { schema, extra } = testSchemaOptions('erp_inbox_settled_guard');

const enqueue = (n: number) =>
    inbox.enqueue({
        stream: 'price',
        entityId: `pr-${n}`,
        version: '1',
        sourceEventId: `evt-${n}`,
        payload: { sku: `SKU-${n}` },
    });

const reload = (id: number) =>
    dataSource.getRepository(IntegrationInboxEvent).findOneByOrFail({ id });

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [IntegrationInboxEvent],
        synchronize: true,
    });
    await dataSource.initialize();
    inbox = new IntegrationInboxService(dataSource);
});

afterEach(async () => {
    await dataSource.getRepository(IntegrationInboxEvent).clear();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('inbox outcome writes (integration, real Postgres)', () => {
    it('two concurrent markFailed calls both count: attempts is incremented atomically', async () => {
        const row = await enqueue(1);

        await Promise.all([
            inbox.markFailedUnclaimed(row.id, new Error('boom')),
            inbox.markFailedUnclaimed(row.id, new Error('boom')),
        ]);

        expect((await reload(row.id)).attempts).toBe(2);
    });

    it('a late markFailed or markProcessed does not overwrite a row another worker settled', async () => {
        const row = await enqueue(2);
        await inbox.markProcessedUnclaimed(row.id, 'applied');

        await inbox.markFailedUnclaimed(row.id, new Error('stale worker'));
        await inbox.markProcessedUnclaimed(row.id, 'noop', 'stale worker');

        const after = await reload(row.id);
        expect(after.status).toBe('processed');
        expect(after.outcome).toBe('applied');
        expect(after.attempts).toBe(0);
    });

    it("a stale claimant whose claim was reclaimed cannot settle the new claimant's row", async () => {
        const row = await enqueue(3);
        const [first] = await inbox.claimBatch(1);
        await dataSource.query(
            `UPDATE integration_inbox_event SET updated_at = now() - interval '1 hour' WHERE id = $1`,
            [row.id],
        );
        const [second] = await inbox.claimBatch(1);
        expect(second.id).toBe(first.id);
        expect(second.claimToken).not.toBe(first.claimToken);

        await inbox.markFailed(row.id, new Error('stale'), Math.random, null, first.claimToken);
        await inbox.markProcessed(row.id, 'applied', null, first.claimToken);

        const untouched = await reload(row.id);
        expect(untouched.status).toBe('processing');
        expect(untouched.attempts).toBe(0);
        expect(untouched.claimToken).toBe(second.claimToken);

        await inbox.markProcessed(row.id, 'applied', null, second.claimToken);
        const settled = await reload(row.id);
        expect(settled.status).toBe('processed');
        expect(settled.claimToken).toBeNull();
    });

    it('markFailed with the current claim token bumps attempts and schedules the retry in one step', async () => {
        const row = await enqueue(4);
        const [claimed] = await inbox.claimBatch(1);

        await inbox.markFailed(row.id, new Error('boom'), Math.random, null, claimed.claimToken);

        const after = await reload(row.id);
        expect(after.status).toBe('pending');
        expect(after.attempts).toBe(1);
        expect(after.lastError).toBe('boom');
        expect(after.nextRetryAt).not.toBeNull();
        expect(after.claimToken).toBeNull();
    });
});
