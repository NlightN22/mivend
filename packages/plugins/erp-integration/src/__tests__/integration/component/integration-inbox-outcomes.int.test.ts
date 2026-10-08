import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { IntegrationInboxEvent } from '../../../entities/integration-inbox-event.entity';
import { IntegrationInboxService } from '../../../integration-inbox.service';
import { makeInboxProcessor } from './inbox-processor-helpers';

// Silent-drop pattern (#200): every processed row says how it ended.
let dataSource: DataSource;
let inboxService: IntegrationInboxService;
const makeProcessor = (apply: ReturnType<typeof vi.fn>): ReturnType<typeof makeInboxProcessor> =>
    makeInboxProcessor(dataSource, inboxService, apply);

const { schema, extra } = testSchemaOptions('erp_integration_inbox_outcomes');

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
    inboxService = new IntegrationInboxService(dataSource);
});

afterEach(async () => {
    await dataSource.getRepository(IntegrationInboxEvent).clear();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('inbox outcomes (component)', () => {
    it('records outcome applied when the handler returns nothing', async () => {
        await inboxService.enqueue({
            stream: 'product',
            entityId: 'p-ok',
            version: '1',
            sourceEventId: 'evt-ok',
            payload: {},
        });

        await makeProcessor(vi.fn().mockResolvedValue(undefined)).processPendingBatch();

        const [row] = await dataSource.getRepository(IntegrationInboxEvent).find();
        expect(row).toMatchObject({ status: 'processed', outcome: 'applied', outcomeReason: null });
    });

    it('records outcome noop with the handler reason, never a bare processed', async () => {
        await inboxService.enqueue({
            stream: 'product',
            entityId: 'p-noop',
            version: '1',
            sourceEventId: 'evt-noop',
            payload: {},
        });
        const apply = vi.fn().mockResolvedValue({ kind: 'noop', reason: 'missing sku, skipping' });

        await makeProcessor(apply).processPendingBatch();

        const [row] = await dataSource.getRepository(IntegrationInboxEvent).find();
        expect(row).toMatchObject({
            status: 'processed',
            outcome: 'noop',
            outcomeReason: 'missing sku, skipping',
        });
    });

    it('records outcome superseded, without calling the handler, for a stale version', async () => {
        const repo = dataSource.getRepository(IntegrationInboxEvent);
        await inboxService.enqueue({
            stream: 'product',
            entityId: 'p-stale',
            version: '5',
            sourceEventId: 'evt-new',
            payload: {},
        });
        await repo.update({ sourceEventId: 'evt-new' }, { status: 'processed' });
        await inboxService.enqueue({
            stream: 'product',
            entityId: 'p-stale',
            version: '2',
            sourceEventId: 'evt-old',
            payload: {},
        });
        const apply = vi.fn().mockResolvedValue(undefined);

        await makeProcessor(apply).processPendingBatch();

        expect(apply).not.toHaveBeenCalled();
        expect(await repo.findOneByOrFail({ sourceEventId: 'evt-old' })).toMatchObject({
            status: 'processed',
            outcome: 'superseded',
        });
    });
});
