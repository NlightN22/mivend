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

// Inbox idempotency/concurrency pattern (docs/testing-patterns.md, the external-integration-rules skill) — mirrors
// plugin-acquiring's InboxService fix for the real claimBatch race (two concurrent sweeps
// claiming the same row before either committed 'processing'). Real Postgres, not mocked, because
// SELECT ... FOR UPDATE SKIP LOCKED semantics only exist at the DB level.
let dataSource: DataSource;
let inboxService: IntegrationInboxService;

const { schema, extra } = testSchemaOptions('erp_integration_inbox');

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

describe('IntegrationInboxService (integration, real Postgres)', () => {
    it('enqueues a new (stream, entityId, version) as a pending row', async () => {
        const row = await inboxService.enqueue({
            stream: 'product',
            entityId: 'p-1',
            version: '1',
            sourceEventId: 'evt-1',
            payload: { sku: 'SKU-1' },
        });
        expect(row.status).toBe('pending');
        expect(row.attempts).toBe(0);
    });

    it('is a no-op on a duplicate (stream, entityId, version) — dedup key', async () => {
        const first = await inboxService.enqueue({
            stream: 'product',
            entityId: 'p-1',
            version: '1',
            sourceEventId: 'evt-1',
            payload: { sku: 'SKU-1' },
        });
        const second = await inboxService.enqueue({
            stream: 'product',
            entityId: 'p-1',
            version: '1',
            sourceEventId: 'evt-1-redelivered',
            payload: { sku: 'SKU-1' },
        });
        expect(second.id).toBe(first.id);

        const rows = await dataSource
            .getRepository(IntegrationInboxEvent)
            .find({ where: { stream: 'product', entityId: 'p-1' } });
        expect(rows).toHaveLength(1);
    });

    it('survives a concurrent duplicate enqueue racing the unique index (not just the app-level check)', async () => {
        const input = {
            stream: 'product' as const,
            entityId: 'p-race',
            version: '1',
            sourceEventId: 'evt-race',
            payload: { sku: 'SKU-RACE' },
        };
        const [a, b] = await Promise.all([
            inboxService.enqueue(input),
            inboxService.enqueue(input),
        ]);
        expect(a.id).toBe(b.id);

        const rows = await dataSource
            .getRepository(IntegrationInboxEvent)
            .find({ where: { stream: 'product', entityId: 'p-race' } });
        expect(rows).toHaveLength(1);
    });

    it('claimBatch prevents two concurrent claimers from both taking the same pending row', async () => {
        await inboxService.enqueue({
            stream: 'stock',
            entityId: 's-1',
            version: '1',
            sourceEventId: 'evt-2',
            payload: { sku: 'SKU-2', stockOnHand: 5 },
        });

        const [batchA, batchB] = await Promise.all([
            inboxService.claimBatch(10),
            inboxService.claimBatch(10),
        ]);
        const totalClaimed = batchA.length + batchB.length;
        expect(totalClaimed).toBe(1);
    });

    it('claimBatch does not reclaim a row still actively processing (not yet stale)', async () => {
        await inboxService.enqueue({
            stream: 'stock',
            entityId: 's-fresh',
            version: '1',
            sourceEventId: 'evt-3',
            payload: { sku: 'SKU-3', stockOnHand: 1 },
        });
        const [claimed] = await inboxService.claimBatch(10);
        expect(claimed).toBeDefined();

        const secondClaim = await inboxService.claimBatch(10);
        expect(secondClaim).toHaveLength(0);
    });

    it('markFailed dead-letters once attempts reach maxAttempts, else stays pending for retry', async () => {
        const row = await inboxService.enqueue({
            stream: 'price',
            entityId: 'pr-1',
            version: '1',
            sourceEventId: 'evt-4',
            payload: { sku: 'SKU-4', priceTypeCode: 'RETAIL', price: 100 },
        });

        await inboxService.markFailed(row.id, new Error('boom'), 2);
        let updated = await dataSource
            .getRepository(IntegrationInboxEvent)
            .findOneOrFail({ where: { id: row.id } });
        expect(updated.status).toBe('pending');
        expect(updated.attempts).toBe(1);

        await inboxService.markFailed(row.id, new Error('boom again'), 2);
        updated = await dataSource
            .getRepository(IntegrationInboxEvent)
            .findOneOrFail({ where: { id: row.id } });
        expect(updated.status).toBe('failed');
        expect(updated.attempts).toBe(2);
    });

    it('markProcessed sets status and processedAt', async () => {
        const row = await inboxService.enqueue({
            stream: 'category',
            entityId: 'c-1',
            version: '1',
            sourceEventId: 'evt-5',
            payload: { name: 'Widgets' },
        });
        await inboxService.markProcessed(row.id);
        const updated = await dataSource
            .getRepository(IntegrationInboxEvent)
            .findOneOrFail({ where: { id: row.id } });
        expect(updated.status).toBe('processed');
        expect(updated.processedAt).not.toBeNull();
    });
});
