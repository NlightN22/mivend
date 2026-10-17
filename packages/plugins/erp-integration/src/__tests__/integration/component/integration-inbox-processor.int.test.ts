import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';
import { UnknownOrderUuidError } from '@mivend/plugin-reservation';

import { IntegrationInboxEvent } from '../../../entities/integration-inbox-event.entity';
import { makeInboxProcessor } from './inbox-processor-helpers';
import { IntegrationInboxService } from '../../../integration-inbox.service';
import { MissingDependencyError } from '../../../types';

// Handlers are stubbed on purpose: this suite tests inbox lifecycle and dispatch/guard logic only.
// Real catalog writes are tested in erp-import; these handlers mirror its upsert logic.
let dataSource: DataSource;
let inboxService: IntegrationInboxService;
const makeProcessor = (apply: ReturnType<typeof vi.fn>): ReturnType<typeof makeInboxProcessor> =>
    makeInboxProcessor(dataSource, inboxService, apply);

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

    it('dead-letters a failing row once the 24h wall-clock budget is exceeded', async () => {
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
        // First failure more than 24h ago: the budget is spent.
        await dataSource.query(
            "UPDATE integration_inbox_event SET first_failed_at = now() - interval '25 hours' WHERE id = $1",
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
        await inboxService.markProcessedUnclaimed(newer.id);

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

        // Reversed enqueue: createdAt order alone yields [v9, v10]; claimBatch must re-sort by version.
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
        // Both rows are pending at claim, so both apply; ascending in-batch sort leaves v10 as final state.
        expect(applied).toEqual([
            { sku: 'SKU-ORDER', stockOnHand: 9 },
            { sku: 'SKU-ORDER', stockOnHand: 10 },
        ]);
    });

    // Bulk backlog must never delay critical-lane claims; a large resync otherwise starves releases.
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

    // Large backlogs must drain within one tick, not one poll interval per batch.
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
        const first = await processor.processPendingBatch(['price'], 3);
        expect(first.claimed).toBe(3);
        expect(first.processed).toBe(3);

        const second = await processor.processPendingBatch(['price'], 3);
        expect(second.claimed).toBe(2);
        expect(second.processed).toBe(2);

        const third = await processor.processPendingBatch(['price'], 3);
        expect(third.claimed).toBe(0);
    });

    // Batch loop must honor deadlineMs too, or one slow batch overruns the task timeout.
    // Unreached rows must be re-claimable at once; a 5-min stale wait would break FIFO under backlog.
    it('stops processing a batch once deadlineMs is reached, releasing the rest back to pending', async () => {
        const apply = vi.fn().mockResolvedValue(undefined);
        for (let i = 0; i < 3; i++) {
            await inboxService.enqueue({
                stream: 'price',
                entityId: `p-deadline-${i}`,
                version: '1',
                sourceEventId: `evt-p-deadline-${i}`,
                payload: { sku: `SKU-${i}` },
            });
        }

        const processor = makeProcessor(apply);
        const { processed, failed, claimed } = await processor.processPendingBatch(
            ['price'],
            10,
            Date.now() - 1,
        );

        expect(claimed).toBe(3);
        expect(processed).toBe(0);
        expect(failed).toBe(0);
        expect(apply).not.toHaveBeenCalled();

        const rows = await dataSource.getRepository(IntegrationInboxEvent).find();
        expect(rows.every(row => row.status === 'pending')).toBe(true);

        // Immediately re-claimable — no need to wait out the stale-processing threshold.
        const reclaimed = await inboxService.claimBatch(10, ['price']);
        expect(reclaimed).toHaveLength(3);
    });

    it('releases only the rows not yet reached when the deadline hits partway through a batch', async () => {
        let now = Date.now();
        const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
        const apply = vi.fn().mockImplementation(async () => {
            now += 1000;
        });
        for (let i = 0; i < 3; i++) {
            await inboxService.enqueue({
                stream: 'price',
                entityId: `p-partial-${i}`,
                version: '1',
                sourceEventId: `evt-p-partial-${i}`,
                payload: { sku: `SKU-${i}` },
            });
        }

        const processor = makeProcessor(apply);
        const deadlineMs = now + 1500;
        const { processed, claimed } = await processor.processPendingBatch(
            ['price'],
            10,
            deadlineMs,
        );
        nowSpy.mockRestore();

        expect(claimed).toBe(3);
        expect(processed).toBe(2);

        const rows = await dataSource.getRepository(IntegrationInboxEvent).find();
        const statuses = rows.map(row => row.status).sort();
        expect(statuses).toEqual(['pending', 'processed', 'processed']);
    });

    // One retry policy for every failure: a plain handler error and a MissingDependencyError
    // both schedule a backoff retry instead of dead-lettering on the first attempts.
    it.each([
        ['a plain handler error', new Error('handler exploded')],
        ['a MissingDependencyError', new MissingDependencyError('warehouse not found yet')],
    ])('schedules a backoff retry (not a dead-letter) on %s', async (_label, thrown) => {
        const apply = vi.fn().mockRejectedValue(thrown);
        const row = await inboxService.enqueue({
            stream: 'product',
            entityId: 'p-retry',
            version: '1',
            sourceEventId: 'evt-retry',
            payload: { sku: 'SKU-R' },
        });

        await makeProcessor(apply).processPendingBatch();

        const updated = await dataSource
            .getRepository(IntegrationInboxEvent)
            .findOneOrFail({ where: { id: row.id } });
        expect(updated.status).toBe('pending');
        expect(updated.attempts).toBe(1);
        expect(updated.nextRetryAt!.getTime()).toBeGreaterThan(Date.now());
    });

    // Issue #211: no local Order matches any correlation key — these prove the budget gate.
    describe('UnknownOrderUuidError (issue #211)', () => {
        it('still retries with backoff like any other error while inside the retry budget', async () => {
            const apply = vi
                .fn()
                .mockRejectedValue(
                    new UnknownOrderUuidError('no Order found via orderUuid=unknown'),
                );
            const row = await inboxService.enqueue({
                stream: 'order-registration-result',
                entityId: 'order-unknown',
                version: '1',
                sourceEventId: 'evt-unknown-fresh',
                payload: { orderCode: 'ORD-UNKNOWN' },
            });

            await makeProcessor(apply).processPendingBatch();

            const updated = await dataSource
                .getRepository(IntegrationInboxEvent)
                .findOneOrFail({ where: { id: row.id } });
            expect(updated.status).toBe('pending');
            expect(updated.attempts).toBe(1);
            expect(updated.nextRetryAt!.getTime()).toBeGreaterThan(Date.now());
        });

        it('resolves as a noop with reason "unknown order uuid" once the retry budget is exhausted', async () => {
            const apply = vi
                .fn()
                .mockRejectedValue(
                    new UnknownOrderUuidError('no Order found via orderUuid=unknown'),
                );
            const row = await inboxService.enqueue({
                stream: 'order-changed',
                entityId: 'order-unknown-old',
                version: '1',
                sourceEventId: 'evt-unknown-old',
                payload: { orderEntityId: 'order-unknown-old' },
            });
            // First failure more than 24h ago: the retry budget is spent.
            await dataSource.query(
                "UPDATE integration_inbox_event SET first_failed_at = now() - interval '25 hours' WHERE id = $1",
                [row.id],
            );

            await makeProcessor(apply).processPendingBatch();

            const updated = await dataSource
                .getRepository(IntegrationInboxEvent)
                .findOneOrFail({ where: { id: row.id } });
            expect(updated.status).toBe('processed');
            expect(updated.outcome).toBe('noop');
            expect(updated.outcomeReason).toBe('unknown order uuid');
        });

        it('leaves a genuine race (a plain Error, not UnknownOrderUuidError) dead-lettering to failed after the same budget', async () => {
            const apply = vi.fn().mockRejectedValue(new Error('order not yet created locally'));
            const row = await inboxService.enqueue({
                stream: 'order-changed',
                entityId: 'order-race',
                version: '1',
                sourceEventId: 'evt-race-old',
                payload: { orderEntityId: 'order-race' },
            });
            await dataSource.query(
                "UPDATE integration_inbox_event SET first_failed_at = now() - interval '25 hours' WHERE id = $1",
                [row.id],
            );

            await makeProcessor(apply).processPendingBatch();

            const updated = await dataSource
                .getRepository(IntegrationInboxEvent)
                .findOneOrFail({ where: { id: row.id } });
            expect(updated.status).toBe('failed');
            expect(updated.outcome).not.toBe('noop');
        });
    });
});
