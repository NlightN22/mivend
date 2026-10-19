import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { DataSource } from 'typeorm';
import {
    createTestConnection,
    createTestSchema,
    ctxQuery,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { IntegrationInboxEvent } from '../../../entities/integration-inbox-event.entity';
import { IntegrationInboxService } from '../../../integration-inbox.service';
import { makeInboxProcessor } from './inbox-processor-helpers';

// Atomicity (docs/testing-patterns.md): a handler's writes and the processed mark commit together;
// a failing handler leaves none of its writes and the row is settled as failed after the rollback.
let dataSource: DataSource;
let inbox: IntegrationInboxService;

const { schema, extra } = testSchemaOptions('erp_integration_inbox_handler_rollback');

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
    inbox = new IntegrationInboxService(createTestConnection(dataSource));
    await dataSource.query('CREATE TABLE handler_write (entity_id text)');
});

afterEach(async () => {
    await dataSource.getRepository(IntegrationInboxEvent).clear();
    await dataSource.query('DELETE FROM handler_write');
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const writeThen = (fail: boolean) =>
    vi.fn(async (ctx: RequestContext, entityId: string) => {
        await ctxQuery<unknown>(
            createTestConnection(dataSource),
            ctx,
            'INSERT INTO handler_write (entity_id) VALUES ($1)',
            [entityId],
        );
        if (fail) throw new Error('handler failed after its write');
    });

async function enqueueOne(): Promise<void> {
    await inbox.enqueue(testRequestContext, {
        stream: 'product',
        entityId: 'p-1',
        version: '1',
        sourceEventId: 'evt-1',
        payload: {},
    });
}

describe('inbox handler transaction (component, real Postgres)', () => {
    it('commits the handler write together with the processed mark', async () => {
        await enqueueOne();

        await makeInboxProcessor(dataSource, inbox, writeThen(false)).processPendingBatch();

        expect(await dataSource.query('SELECT 1 FROM handler_write')).toHaveLength(1);
        const [row] = await dataSource.getRepository(IntegrationInboxEvent).find();
        expect(row.status).toBe('processed');
    });

    it('rolls the handler write back on failure and still records the failed attempt', async () => {
        await enqueueOne();

        const result = await makeInboxProcessor(
            dataSource,
            inbox,
            writeThen(true),
        ).processPendingBatch();

        expect(result.failed).toBe(1);
        expect(await dataSource.query('SELECT 1 FROM handler_write')).toHaveLength(0);
        const [row] = await dataSource.getRepository(IntegrationInboxEvent).find();
        expect(row).toMatchObject({
            status: 'pending',
            attempts: 1,
            lastError: 'handler failed after its write',
        });
    });
});
