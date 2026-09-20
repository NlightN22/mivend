import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { IntegrationInboxEvent } from '../../../entities/integration-inbox-event.entity';
import { IntegrationInboxProcessorService } from '../../../integration-inbox-processor.service';
import { IntegrationInboxService } from '../../../integration-inbox.service';
import { MissingDependencyError } from '../../../types';

// Component chain: pending row -> claim -> handler.apply -> processed / retry / dead-letter, plus
// the out-of-order guard. Handlers are stubbed (never real ProductService/etc.) — this suite
// proves the inbox lifecycle and dispatch/guard logic, not real Vendure catalog writes (those are
// exercised in erp-import's own existing handler tests, whose upsert logic this plugin's
// handlers deliberately mirror).
let dataSource: DataSource;
let inboxService: IntegrationInboxService;

const { schema, extra } = testSchemaOptions('erp_integration_inbox_processor');

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

function makeProcessor(apply: ReturnType<typeof vi.fn>): IntegrationInboxProcessorService {
    const stubHandler = { apply };
    const requestContextService = { create: vi.fn().mockResolvedValue({}) };
    return new IntegrationInboxProcessorService(
        dataSource,
        inboxService,
        requestContextService as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
    );
}

describe('IntegrationInboxProcessorService.processPendingBatch (component)', () => {
    it('applies a pending row and marks it processed', async () => {
        const apply = vi.fn().mockResolvedValue(undefined);
        await inboxService.enqueue({
            stream: 'product',
            entityId: 'p-1',
            version: '1',
            sourceEventId: 'evt-1',
            payload: { sku: 'SKU-1' },
        });

        const { processed, failed } = await makeProcessor(apply).processPendingBatch();
        expect(processed).toBe(1);
        expect(failed).toBe(0);
        expect(apply).toHaveBeenCalledTimes(1);

        const rows = await dataSource.getRepository(IntegrationInboxEvent).find();
        expect(rows[0].status).toBe('processed');
    });

    it('retries on handler failure below maxAttempts, dead-letters at the bound', async () => {
        const apply = vi.fn().mockRejectedValue(new Error('handler exploded'));
        const row = await inboxService.enqueue({
            stream: 'product',
            entityId: 'p-2',
            version: '1',
            sourceEventId: 'evt-2',
            payload: { sku: 'SKU-2' },
        });

        await makeProcessor(apply).processPendingBatch(2);
        let updated = await dataSource
            .getRepository(IntegrationInboxEvent)
            .findOneOrFail({ where: { id: row.id } });
        expect(updated.status).toBe('pending');
        expect(updated.attempts).toBe(1);

        await makeProcessor(apply).processPendingBatch(2);
        updated = await dataSource
            .getRepository(IntegrationInboxEvent)
            .findOneOrFail({ where: { id: row.id } });
        expect(updated.status).toBe('failed');
        expect(updated.attempts).toBe(2);
    });

    // Issue #96: a MissingDependencyError must schedule a backoff retry (stays 'pending',
    // 'nextRetryAt' set) instead of being dead-lettered immediately like every other error.
    it('schedules a backoff retry on MissingDependencyError instead of dead-lettering it', async () => {
        const apply = vi
            .fn()
            .mockRejectedValue(new MissingDependencyError('warehouse not found yet'));
        const row = await inboxService.enqueue({
            stream: 'stock',
            entityId: 's-missing-dep',
            version: '1',
            sourceEventId: 'evt-missing-dep',
            payload: { sku: 'SKU-MD' },
        });

        // maxAttempts=1 would dead-letter on the very first failure via markFailed — proves the
        // MissingDependencyError path is a genuinely different branch, not just a lucky
        // maxAttempts headroom.
        await makeProcessor(apply).processPendingBatch(1);

        const updated = await dataSource
            .getRepository(IntegrationInboxEvent)
            .findOneOrFail({ where: { id: row.id } });
        expect(updated.status).toBe('pending');
        expect(updated.attempts).toBe(1);
        expect(updated.nextRetryAt).not.toBeNull();
        expect(updated.nextRetryAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('does not reclaim a MissingDependencyError row before its nextRetryAt', async () => {
        const apply = vi
            .fn()
            .mockRejectedValue(new MissingDependencyError('warehouse not found yet'));
        await inboxService.enqueue({
            stream: 'stock',
            entityId: 's-not-yet',
            version: '1',
            sourceEventId: 'evt-not-yet',
            payload: { sku: 'SKU-NY' },
        });
        await makeProcessor(apply).processPendingBatch();
        expect(apply).toHaveBeenCalledTimes(1);

        const { claimed } = await makeProcessor(apply).processPendingBatch();
        expect(claimed).toBe(0);
        expect(apply).toHaveBeenCalledTimes(1);
    });

    it('dead-letters a MissingDependencyError row once the 24h wall-clock budget is exceeded', async () => {
        const apply = vi
            .fn()
            .mockRejectedValue(new MissingDependencyError('warehouse not found yet'));
        const row = await inboxService.enqueue({
            stream: 'stock',
            entityId: 's-old',
            version: '1',
            sourceEventId: 'evt-old',
            payload: { sku: 'SKU-OLD' },
        });
        // Backdate createdAt past the 24h wall-clock budget directly in the DB (CreateDateColumn
        // can't be set via the normal repo API).
        await dataSource.query(
            "UPDATE integration_inbox_event SET created_at = now() - interval '25 hours' WHERE id = $1",
            [row.id],
        );

        await makeProcessor(apply).processPendingBatch();

        const updated = await dataSource
            .getRepository(IntegrationInboxEvent)
            .findOneOrFail({ where: { id: row.id } });
        expect(updated.status).toBe('failed');
        expect(updated.nextRetryAt).toBeNull();
    });

    it('skips applying (but still marks processed) a version superseded by an already-processed newer version', async () => {
        const apply = vi.fn().mockResolvedValue(undefined);

        // Newer version processed first (simulates out-of-order delivery within a stream).
        const newer = await inboxService.enqueue({
            stream: 'stock',
            entityId: 's-1',
            version: '5',
            sourceEventId: 'evt-newer',
            payload: { sku: 'SKU-S1', stockOnHand: 10 },
        });
        await inboxService.markProcessed(newer.id);

        await inboxService.enqueue({
            stream: 'stock',
            entityId: 's-1',
            version: '2',
            sourceEventId: 'evt-stale',
            payload: { sku: 'SKU-S1', stockOnHand: 999 },
        });

        const { processed } = await makeProcessor(apply).processPendingBatch();
        expect(processed).toBe(1);
        // The stale row is marked processed (it's not itself an error) but the handler must never
        // have been invoked with its regressive payload.
        expect(apply).not.toHaveBeenCalled();
    });

    it('applies two pending versions of the same entity claimed in one batch in ascending version order', async () => {
        const applied: unknown[] = [];
        const apply = vi.fn().mockImplementation(async (_ctx, _entityId, payload) => {
            applied.push(payload);
        });

        // Enqueued in reverse order so claimBatch's createdAt-ASC ordering would hand the
        // processor [v9, v10] if it didn't re-sort by version (issue #62 review, MEDIUM #1) —
        // both land in the same claimBatch() call, both still 'pending' at claim time.
        await inboxService.enqueue({
            stream: 'stock',
            entityId: 's-order',
            version: '9',
            sourceEventId: 'evt-9',
            payload: { sku: 'SKU-ORDER', stockOnHand: 9 },
        });
        await inboxService.enqueue({
            stream: 'stock',
            entityId: 's-order',
            version: '10',
            sourceEventId: 'evt-10',
            payload: { sku: 'SKU-ORDER', stockOnHand: 10 },
        });

        const { processed } = await makeProcessor(apply).processPendingBatch();
        expect(processed).toBe(2);
        expect(apply).toHaveBeenCalledTimes(2);
        // Both versions started 'pending' (neither is stale relative to an already-*processed*
        // row yet), so both are genuinely applied — but the in-batch sort (MEDIUM #1 fix) must
        // apply them in ascending version order, '9' then '10', so '10' is the final state
        // instead of a lower version clobbering a higher one applied first.
        expect(applied).toEqual([
            { sku: 'SKU-ORDER', stockOnHand: 9 },
            { sku: 'SKU-ORDER', stockOnHand: 10 },
        ]);
    });

    // Issue #93: the critical lane's stream filter must claim/process order-registration-result
    // promptly regardless of how large the bulk-stream backlog is — this is the actual incident
    // (a 275k-row price/stock resync starving reservation-release-blocking messages).
    it("processes only the requested lane's streams even with a large backlog of other streams pending", async () => {
        const apply = vi.fn().mockResolvedValue(undefined);
        for (let i = 0; i < 25; i++) {
            await inboxService.enqueue({
                stream: 'price',
                entityId: `bulk-${i}`,
                version: '1',
                sourceEventId: `evt-bulk-${i}`,
                payload: { sku: `SKU-${i}` },
            });
        }
        await inboxService.enqueue({
            stream: 'order-registration-result',
            entityId: 'order-1',
            version: '1',
            sourceEventId: 'evt-critical',
            payload: { orderCode: 'ORD-1' },
        });

        const { processed, claimed } = await makeProcessor(apply).processPendingBatch(
            undefined,
            ['order-registration-result'],
            20,
        );
        expect(claimed).toBe(1);
        expect(processed).toBe(1);
        expect(apply).toHaveBeenCalledTimes(1);
        expect(apply).toHaveBeenCalledWith(expect.anything(), 'order-1', { orderCode: 'ORD-1' });

        const pendingBulk = await dataSource
            .getRepository(IntegrationInboxEvent)
            .find({ where: { stream: 'price' } });
        expect(pendingBulk.every(row => row.status === 'pending')).toBe(true);
    });

    // Issue #93: the bulk lane's scheduled task loops processPendingBatch while `claimed` comes
    // back equal to the requested batch size, draining more than one batch worth of backlog
    // within a single tick instead of waiting for the next poll interval.
    it("reports claimed === batchSize when more pending rows remain, enabling the bulk lane's immediate-reclaim loop", async () => {
        const apply = vi.fn().mockResolvedValue(undefined);
        for (let i = 0; i < 5; i++) {
            await inboxService.enqueue({
                stream: 'price',
                entityId: `p-${i}`,
                version: '1',
                sourceEventId: `evt-p-${i}`,
                payload: { sku: `SKU-${i}` },
            });
        }

        const processor = makeProcessor(apply);
        const first = await processor.processPendingBatch(undefined, ['price'], 3);
        expect(first.claimed).toBe(3);
        expect(first.processed).toBe(3);

        const second = await processor.processPendingBatch(undefined, ['price'], 3);
        expect(second.claimed).toBe(2);
        expect(second.processed).toBe(2);

        const third = await processor.processPendingBatch(undefined, ['price'], 3);
        expect(third.claimed).toBe(0);
    });
});
