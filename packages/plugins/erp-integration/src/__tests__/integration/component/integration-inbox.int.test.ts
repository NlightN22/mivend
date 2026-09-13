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
    it('enqueues a new (stream, sourceEventId) as a pending row', async () => {
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

    it('is a no-op on a duplicate (stream, sourceEventId) — dedup key', async () => {
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
            sourceEventId: 'evt-1',
            payload: { sku: 'SKU-1' },
        });
        expect(second.id).toBe(first.id);

        const rows = await dataSource
            .getRepository(IntegrationInboxEvent)
            .find({ where: { stream: 'product', entityId: 'p-1' } });
        expect(rows).toHaveLength(1);
    });

    // Issue #89: this is the actual regression test for the live bug — a Search Platform backfill
    // event collided on `version` with an earlier, unrelated event for the same entity, and the
    // old (stream, entityId, version) dedup key silently discarded it. Two distinct sourceEventIds
    // sharing the same version must both persist.
    it('does not conflate two distinct events for the same entity that happen to share a version', async () => {
        const first = await inboxService.enqueue({
            stream: 'product',
            entityId: 'p-1',
            version: '2026-09-12T14:13:47Z',
            sourceEventId: 'evt-original-update',
            payload: { sku: 'SKU-1' },
        });
        const second = await inboxService.enqueue({
            stream: 'product',
            entityId: 'p-1',
            version: '2026-09-12T14:13:47Z',
            sourceEventId: 'evt-backfilled-deactivation',
            payload: { sku: 'SKU-1', isActive: false },
        });
        expect(second.id).not.toBe(first.id);

        const rows = await dataSource
            .getRepository(IntegrationInboxEvent)
            .find({ where: { stream: 'product', entityId: 'p-1' } });
        expect(rows).toHaveLength(2);
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

    // issue #76's dashboard read model — recent dead-lettered events for a manager to notice.
    describe('findFailed', () => {
        it('returns a failed row', async () => {
            const row = await inboxService.enqueue({
                stream: 'product',
                entityId: 'p-failed',
                version: '1',
                sourceEventId: 'evt-failed',
                payload: { sku: 'SKU-FAILED' },
            });
            await inboxService.markFailed(row.id, new Error('boom'), 1);

            const result = await inboxService.findFailed();
            expect(result.items.map(i => i.id)).toContain(row.id);
            expect(result.totalItems).toBe(1);
        });

        it('does not return a pending/processed row', async () => {
            await inboxService.enqueue({
                stream: 'product',
                entityId: 'p-pending',
                version: '1',
                sourceEventId: 'evt-pending',
                payload: { sku: 'SKU-PENDING' },
            });
            const processedRow = await inboxService.enqueue({
                stream: 'product',
                entityId: 'p-processed',
                version: '1',
                sourceEventId: 'evt-processed',
                payload: { sku: 'SKU-PROCESSED' },
            });
            await inboxService.markProcessed(processedRow.id);

            const result = await inboxService.findFailed();
            expect(result.items).toEqual([]);
            expect(result.totalItems).toBe(0);
        });

        it('paginates with take/skip', async () => {
            for (let i = 0; i < 5; i++) {
                const row = await inboxService.enqueue({
                    stream: 'product',
                    entityId: `p-page-${i}`,
                    version: '1',
                    sourceEventId: `evt-page-${i}`,
                    payload: { sku: `SKU-PAGE-${i}` },
                });
                await inboxService.markFailed(row.id, new Error('boom'), 1);
            }

            const page1 = await inboxService.findFailed({ take: 2, skip: 0 });
            const page2 = await inboxService.findFailed({ take: 2, skip: 2 });
            expect(page1.totalItems).toBe(5);
            expect(page2.totalItems).toBe(5);
            expect(page1.items).toHaveLength(2);
            expect(page2.items).toHaveLength(2);
            const page1Ids = page1.items.map(i => i.id);
            const page2Ids = page2.items.map(i => i.id);
            expect(page1Ids.some(id => page2Ids.includes(id))).toBe(false);
        });

        it('orders newest-updated first, with id as a tiebreaker', async () => {
            const rows = [];
            for (let i = 0; i < 3; i++) {
                const row = await inboxService.enqueue({
                    stream: 'product',
                    entityId: `p-order-${i}`,
                    version: '1',
                    sourceEventId: `evt-order-${i}`,
                    payload: { sku: `SKU-ORDER-${i}` },
                });
                await inboxService.markFailed(row.id, new Error('boom'), 1);
                rows.push(row);
            }

            const result = await inboxService.findFailed();
            const resultIds = result.items.map(i => i.id);
            expect(resultIds).toEqual([...rows.map(r => r.id)].reverse());
        });
    });
});
