import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
import { ProductStreamHandler } from '../../../handlers/product.handler';
import { IntegrationInboxService } from '../../../integration-inbox.service';
import { makeInboxProcessor } from './inbox-processor-helpers';

// A failed review-flag write inside the inbox transaction must not abort the product import (#257).
let dataSource: DataSource;
let inbox: IntegrationInboxService;
let handler: ProductStreamHandler;

const { schema, extra } = testSchemaOptions('erp_integration_product_flag_savepoint');

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
    const connection = createTestConnection(dataSource);
    inbox = new IntegrationInboxService(connection);
    await dataSource.query('CREATE TABLE product_write (entity_id text)');
    await dataSource.query('CREATE TABLE flag_write (entity_id text NOT NULL)');
    const failingFlag = {
        report: (ctx: RequestContext) =>
            ctxQuery(connection, ctx, 'INSERT INTO flag_write (entity_id) VALUES (NULL)'),
    };
    const taxCategories = {
        findAll: async () => ({ items: [{ id: 1, isDefault: true, customFields: {} }] }),
    };
    const args: unknown[] = Array(13).fill({});
    args[0] = connection;
    args[3] = taxCategories;
    args[4] = failingFlag;
    handler = new (ProductStreamHandler as unknown as new (
        ...a: unknown[]
    ) => ProductStreamHandler)(...args);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('product VAT flag write under a savepoint (component, real Postgres)', () => {
    it('saves the product and marks the inbox row processed when the flag write fails', async () => {
        await inbox.enqueue(testRequestContext, {
            stream: 'product',
            entityId: 'p-1',
            version: '1',
            sourceEventId: 'evt-1',
            payload: {},
        });
        const apply = vi.fn(async (ctx: RequestContext, entityId: string) => {
            await (
                handler as unknown as {
                    resolveTaxCategoryId: (
                        c: RequestContext,
                        id: string,
                        raw: string,
                    ) => Promise<string>;
                }
            ).resolveTaxCategoryId(ctx, entityId, '');
            await ctxQuery(
                createTestConnection(dataSource),
                ctx,
                'INSERT INTO product_write (entity_id) VALUES ($1)',
                [entityId],
            );
        });

        const result = await makeInboxProcessor(dataSource, inbox, apply).processPendingBatch();

        expect(result.failed).toBe(0);
        expect(await dataSource.query('SELECT 1 FROM product_write')).toHaveLength(1);
        expect(await dataSource.query('SELECT 1 FROM flag_write')).toHaveLength(0);
        const [row] = await dataSource.getRepository(IntegrationInboxEvent).find();
        expect(row.status).toBe('processed');
    });
});
