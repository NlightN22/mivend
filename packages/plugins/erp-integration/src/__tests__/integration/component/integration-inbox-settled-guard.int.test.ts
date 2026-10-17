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
            inbox.markFailed(row.id, new Error('boom')),
            inbox.markFailed(row.id, new Error('boom')),
        ]);

        expect((await reload(row.id)).attempts).toBe(2);
    });

    it('a late markFailed or markProcessed does not overwrite a row another worker settled', async () => {
        const row = await enqueue(2);
        await inbox.markProcessed(row.id, 'applied');

        await inbox.markFailed(row.id, new Error('stale worker'));
        await inbox.markProcessed(row.id, 'noop', 'stale worker');

        const after = await reload(row.id);
        expect(after.status).toBe('processed');
        expect(after.outcome).toBe('applied');
        expect(after.attempts).toBe(0);
    });
});
