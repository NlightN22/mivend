import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { IntegrationInboxEvent } from '../../../entities/integration-inbox-event.entity';
import { IntegrationInboxHealthService } from '../../../integration-inbox-health.service';
import { IntegrationInboxService } from '../../../integration-inbox.service';

// Inbox idempotency/concurrency pattern (docs/testing-patterns.md, the external-integration-rules skill) — mirrors
// plugin-acquiring's InboxService fix for the real claimBatch race (two concurrent sweeps
// claiming the same row before either committed 'processing'). Real Postgres, not mocked, because
// SELECT ... FOR UPDATE SKIP LOCKED semantics only exist at the DB level.
let dataSource: DataSource;
let inboxService: IntegrationInboxService;
let inboxHealth: IntegrationInboxHealthService;

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
    inboxHealth = new IntegrationInboxHealthService(dataSource);
});

afterEach(async () => {
    await dataSource.getRepository(IntegrationInboxEvent).clear();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

// markFailed only dead-letters 24h after the first failure, so backdate first_failed_at first.
async function deadLetter(id: number): Promise<void> {
    await dataSource.query(
        "UPDATE integration_inbox_event SET first_failed_at = now() - interval '25 hours' WHERE id = $1",
        [id],
    );
    await inboxService.markFailed(id, new Error('boom'));
}

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

    // #148 HIGH regression — see claimBatch's own comment and docs/environments.md's #148 note.
    it('does not re-claim a row a competing sweep already claimed and committed between the two phases', async () => {
        const row = await inboxService.enqueue({
            stream: 'stock',
            entityId: 's-race',
            version: '1',
            sourceEventId: 'evt-race-committed',
            payload: {},
        });

        const privateInbox = inboxService as unknown as {
            findClaimCandidateIds: (...args: unknown[]) => Promise<string[]>;
        };
        const original = privateInbox.findClaimCandidateIds.bind(inboxService);
        vi.spyOn(privateInbox, 'findClaimCandidateIds').mockImplementationOnce(async (...args) => {
            const ids = await original(...args);
            // A separate, already-committed transaction claims the row before phase 2 runs.
            await dataSource
                .getRepository(IntegrationInboxEvent)
                .update(row.id, { status: 'processing' });
            return ids;
        });

        const claimed = await inboxService.claimBatch(10, ['stock']);

        expect(claimed).toHaveLength(0);
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

    // #146: order by eligibility time — a retry that came due later can't starve newer rows,
    // and a retry that came due earlier isn't starved by them.
    describe('claimBatch fairness between retries and fresh rows', () => {
        async function enqueueAt(entityId: string, createdAgo: string): Promise<number> {
            const row = await inboxService.enqueue({
                stream: 'price',
                entityId,
                version: '1',
                sourceEventId: `evt-${entityId}`,
                payload: {},
            });
            await dataSource.query(
                `UPDATE integration_inbox_event SET created_at = now() - interval '${createdAgo}', eligible_at = now() - interval '${createdAgo}' WHERE id = $1`,
                [row.id],
            );
            return row.id;
        }

        it('claims a fresh row before an older row whose retry came due after it arrived', async () => {
            const retryId = await enqueueAt('pr-retry', '2 hours');
            const freshId = await enqueueAt('pr-fresh', '10 minutes');
            await dataSource.query(
                "UPDATE integration_inbox_event SET attempts = 5, next_retry_at = now() - interval '1 minute', eligible_at = now() - interval '1 minute' WHERE id = $1",
                [retryId],
            );

            const [first] = await inboxService.claimBatch(1);

            expect(first.id).toBe(freshId);
        });

        it('claims a retry that came due before a newer fresh row arrived', async () => {
            const retryId = await enqueueAt('pr-retry', '2 hours');
            await enqueueAt('pr-fresh', '10 minutes');
            await dataSource.query(
                "UPDATE integration_inbox_event SET attempts = 5, next_retry_at = now() - interval '30 minutes', eligible_at = now() - interval '30 minutes' WHERE id = $1",
                [retryId],
            );

            const [first] = await inboxService.claimBatch(1);

            expect(first.id).toBe(retryId);
        });
    });

    it('markFailed schedules a backoff retry inside the 24h budget, dead-letters after it', async () => {
        const row = await inboxService.enqueue({
            stream: 'price',
            entityId: 'pr-1',
            version: '1',
            sourceEventId: 'evt-4',
            payload: { sku: 'SKU-4', priceTypeCode: 'RETAIL', price: 100 },
        });

        await inboxService.markFailed(row.id, new Error('boom'));
        let updated = await dataSource
            .getRepository(IntegrationInboxEvent)
            .findOneOrFail({ where: { id: row.id } });
        expect(updated.status).toBe('pending');
        expect(updated.attempts).toBe(1);
        expect(updated.nextRetryAt!.getTime()).toBeGreaterThan(Date.now());

        await deadLetter(row.id);
        updated = await dataSource
            .getRepository(IntegrationInboxEvent)
            .findOneOrFail({ where: { id: row.id } });
        expect(updated.status).toBe('failed');
        expect(updated.attempts).toBe(2);
        expect(updated.nextRetryAt).toBeNull();
    });

    // #145: the budget starts at the first failure, not at enqueue — a backlog that waited out a
    // long outage must still get retries.
    it('markFailed schedules a retry for a row enqueued more than 24h ago on its first failure', async () => {
        const row = await inboxService.enqueue({
            stream: 'stock',
            entityId: 's-backlog',
            version: '1',
            sourceEventId: 'evt-backlog',
            payload: { sku: 'SKU-B' },
        });
        await dataSource.query(
            "UPDATE integration_inbox_event SET created_at = now() - interval '3 days' WHERE id = $1",
            [row.id],
        );

        await inboxService.markFailed(row.id, new Error('transient'));

        const updated = await dataSource
            .getRepository(IntegrationInboxEvent)
            .findOneOrFail({ where: { id: row.id } });
        expect(updated.status).toBe('pending');
        expect(updated.firstFailedAt).not.toBeNull();
        expect(updated.nextRetryAt!.getTime()).toBeGreaterThan(Date.now());
    });

    // Issue #211: onBudgetExhausted reroutes a budget-exhausted markFailed to a noop outcome.
    it('markFailed resolves as noop with the given reason once the budget is exhausted, when onBudgetExhausted is passed', async () => {
        const row = await inboxService.enqueue({
            stream: 'order-registration-result',
            entityId: 'order-unknown',
            version: '1',
            sourceEventId: 'evt-unknown-order',
            payload: { orderCode: 'ORD-UNKNOWN' },
        });
        await dataSource.query(
            "UPDATE integration_inbox_event SET first_failed_at = now() - interval '25 hours' WHERE id = $1",
            [row.id],
        );

        await inboxService.markFailed(
            row.id,
            new Error('order-registration-result: no Order found'),
            undefined,
            {
                outcome: 'noop',
                reason: 'unknown order uuid',
            },
        );

        const updated = await dataSource
            .getRepository(IntegrationInboxEvent)
            .findOneOrFail({ where: { id: row.id } });
        expect(updated.status).toBe('processed');
        expect(updated.outcome).toBe('noop');
        expect(updated.outcomeReason).toBe('unknown order uuid');
        expect(updated.processedAt).not.toBeNull();
    });

    // Default behaviour (no onBudgetExhausted) is unchanged — still dead-letters to failed.
    it('markFailed still dead-letters to failed once the budget is exhausted, when onBudgetExhausted is omitted', async () => {
        const row = await inboxService.enqueue({
            stream: 'stock',
            entityId: 's-genuine-failure',
            version: '1',
            sourceEventId: 'evt-genuine-failure',
            payload: { sku: 'SKU-GF' },
        });
        await dataSource.query(
            "UPDATE integration_inbox_event SET first_failed_at = now() - interval '25 hours' WHERE id = $1",
            [row.id],
        );

        await inboxService.markFailed(row.id, new Error('boom'));

        const updated = await dataSource
            .getRepository(IntegrationInboxEvent)
            .findOneOrFail({ where: { id: row.id } });
        expect(updated.status).toBe('failed');
        expect(updated.outcome).not.toBe('noop');
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

    // #212: a failed row that can never be replayed (e.g. undecodable) must still have a way out.
    describe('dismissFailed', () => {
        it('moves a failed row out of the failures list, recording the reason', async () => {
            const row = await inboxService.enqueue({
                stream: 'category',
                entityId: 'rejected@0:7',
                version: '',
                sourceEventId: 'rejected@0:7',
                payload: { rawBase64: 'abcd' },
            });
            await deadLetter(row.id);

            const dismissed = await inboxService.dismissFailed(row.id, 'undecodable, no entity id');
            expect(dismissed).toBe(true);

            const updated = await dataSource
                .getRepository(IntegrationInboxEvent)
                .findOneOrFail({ where: { id: row.id } });
            expect(updated.status).toBe('processed');
            expect(updated.outcome).toBe('dismissed');
            expect(updated.outcomeReason).toBe('undecodable, no entity id');

            const failed = await inboxService.findFailed();
            expect(failed.items.find(item => item.id === row.id)).toBeUndefined();
        });

        it('is a no-op on a row that is not failed, so a double click cannot double-dismiss', async () => {
            const row = await inboxService.enqueue({
                stream: 'category',
                entityId: 'c-dismiss-noop',
                version: '1',
                sourceEventId: 'evt-dismiss-noop',
                payload: { name: 'Widgets' },
            });
            await inboxService.markProcessed(row.id, 'applied');

            const dismissed = await inboxService.dismissFailed(row.id, 'late click');
            expect(dismissed).toBe(false);

            const updated = await dataSource
                .getRepository(IntegrationInboxEvent)
                .findOneOrFail({ where: { id: row.id } });
            expect(updated.outcome).toBe('applied');
        });
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
            await deadLetter(row.id);

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
                await deadLetter(row.id);
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
                await deadLetter(row.id);
                rows.push(row);
            }

            const result = await inboxService.findFailed();
            const resultIds = result.items.map(i => i.id);
            expect(resultIds).toEqual([...rows.map(r => r.id)].reverse());
        });
    });

    // Issue #93: claimBatch's stream filter is what makes the priority-lane split possible —
    // each lane's ScheduledTask passes its own disjoint stream set.
    describe('claimBatch stream filter', () => {
        it('claims only rows matching the given streams, leaving others pending', async () => {
            await inboxService.enqueue({
                stream: 'price',
                entityId: 'pr-1',
                version: '1',
                sourceEventId: 'evt-price-1',
                payload: {},
            });
            const critical = await inboxService.enqueue({
                stream: 'order-registration-result',
                entityId: 'order-1',
                version: '1',
                sourceEventId: 'evt-order-1',
                payload: {},
            });

            const claimed = await inboxService.claimBatch(20, ['order-registration-result']);
            expect(claimed.map(r => r.id)).toEqual([critical.id]);

            const priceRow = await dataSource
                .getRepository(IntegrationInboxEvent)
                .findOneOrFail({ where: { stream: 'price' } });
            expect(priceRow.status).toBe('pending');
        });

        it('claims across all matching streams when given more than one', async () => {
            await inboxService.enqueue({
                stream: 'price',
                entityId: 'pr-2',
                version: '1',
                sourceEventId: 'evt-price-2',
                payload: {},
            });
            await inboxService.enqueue({
                stream: 'stock',
                entityId: 'st-1',
                version: '1',
                sourceEventId: 'evt-stock-1',
                payload: {},
            });
            await inboxService.enqueue({
                stream: 'order-registration-result',
                entityId: 'order-2',
                version: '1',
                sourceEventId: 'evt-order-2',
                payload: {},
            });

            const claimed = await inboxService.claimBatch(20, ['price', 'stock']);
            expect(claimed.map(r => r.stream).sort()).toEqual(['price', 'stock']);
        });

        it('claims across every stream when no filter is given (unchanged pre-#93 behavior)', async () => {
            await inboxService.enqueue({
                stream: 'price',
                entityId: 'pr-3',
                version: '1',
                sourceEventId: 'evt-price-3',
                payload: {},
            });
            await inboxService.enqueue({
                stream: 'order-registration-result',
                entityId: 'order-3',
                version: '1',
                sourceEventId: 'evt-order-3',
                payload: {},
            });

            const claimed = await inboxService.claimBatch(20);
            expect(claimed.length).toBe(2);
        });

        // Issue #127 regression: mirrors the real incident shape — an older, larger backlog on
        // one bulk-lane stream ('counterparty') must never delay a newer row on a stream that now
        // claims from its own dedicated lane ('user'). Before the fix, both streams shared the
        // bulk lane's single global `ORDER BY event.createdAt ASC` claim query, so the older
        // counterparty rows always won every claim slot. 'user' now has its own disjoint stream
        // filter, so its row is claimed immediately regardless of counterparty's backlog age/size.
        it('claims a newer user row promptly even with a much older counterparty backlog present', async () => {
            for (let i = 0; i < 5; i++) {
                await inboxService.enqueue({
                    stream: 'counterparty',
                    entityId: `cp-${i}`,
                    version: '1',
                    sourceEventId: `evt-cp-${i}`,
                    payload: {},
                });
            }
            const userRow = await inboxService.enqueue({
                stream: 'user',
                entityId: 'user-1',
                version: '1',
                sourceEventId: 'evt-user-1',
                payload: {},
            });

            const claimed = await inboxService.claimBatch(20, ['user']);
            expect(claimed.map(r => r.id)).toEqual([userRow.id]);

            const counterpartyRows = await dataSource
                .getRepository(IntegrationInboxEvent)
                .find({ where: { stream: 'counterparty' } });
            expect(counterpartyRows.every(row => row.status === 'pending')).toBe(true);
        });
    });

    // Issue #91's "integration health" page — a different number from Kafka lag (already
    // consumed/committed rows waiting on mivend's own processor, not broker-side lag). Real
    // Postgres because the GROUP BY/aggregate shape is exactly what a mocked query builder
    // wouldn't meaningfully exercise.
    describe('getBacklogByStream', () => {
        it('counts pending/processing/failed rows per stream, ignoring processed rows', async () => {
            await inboxService.enqueue({
                stream: 'product',
                entityId: 'p-1',
                version: '1',
                sourceEventId: 'evt-backlog-1',
                payload: {},
            });
            await inboxService.enqueue({
                stream: 'product',
                entityId: 'p-2',
                version: '1',
                sourceEventId: 'evt-backlog-2',
                payload: {},
            });
            const processed = await inboxService.enqueue({
                stream: 'product',
                entityId: 'p-3',
                version: '1',
                sourceEventId: 'evt-backlog-3',
                payload: {},
            });
            await dataSource
                .getRepository(IntegrationInboxEvent)
                .update(processed.id, { status: 'processed' });
            await inboxService.enqueue({
                stream: 'stock',
                entityId: 's-1',
                version: '1',
                sourceEventId: 'evt-backlog-4',
                payload: {},
            });
            const failed = await inboxService.enqueue({
                stream: 'stock',
                entityId: 's-2',
                version: '1',
                sourceEventId: 'evt-backlog-5',
                payload: {},
            });
            await dataSource
                .getRepository(IntegrationInboxEvent)
                .update(failed.id, { status: 'failed' });

            const backlog = await inboxHealth.getBacklogByStream();
            const byStream = Object.fromEntries(backlog.map(b => [b.stream, b]));

            expect(byStream.product).toEqual({
                stream: 'product',
                pending: 2,
                processing: 0,
                failed: 0,
                replayPending: 0,
                oldestPendingAt: expect.any(Date),
            });
            expect(byStream.stock).toEqual({
                stream: 'stock',
                pending: 1,
                processing: 0,
                failed: 1,
                replayPending: 0,
                oldestPendingAt: expect.any(Date),
            });
        });

        it('returns an empty array when there is no backlog at all', async () => {
            const backlog = await inboxHealth.getBacklogByStream();
            expect(backlog).toEqual([]);
        });
    });

    // #147: only the latest processed version per (stream, entityId) is still read (the
    // superseded-version check) — every older processed duplicate's payload is safe to clear.
    // mivend.audit.common's HIGH finding: the row itself, and its (stream, sourceEventId) dedup
    // key, must never be deleted — only tombstoned (payload cleared) — or a redelivered Kafka
    // message with a purged sourceEventId would pass enqueue's dedup as if new and get reapplied.
    describe('purgeSupersededProcessedRows', () => {
        async function enqueueProcessed(
            entityId: string,
            version: string,
            payload: Record<string, unknown> = { real: 'data' },
        ): Promise<number> {
            const row = await inboxService.enqueue({
                stream: 'price',
                entityId,
                version,
                sourceEventId: `evt-${entityId}-${version}`,
                payload,
            });
            await inboxService.markProcessed(row.id);
            return row.id;
        }

        it('tombstones every processed row for an entity except the newest version, keeping every row', async () => {
            const older1 = await enqueueProcessed('pr-1', '1');
            const older2 = await enqueueProcessed('pr-1', '2');
            const newest = await enqueueProcessed('pr-1', '3');

            const tombstoned = await inboxService.purgeSupersededProcessedRows();

            expect(tombstoned).toBe(2);
            const rows = await dataSource
                .getRepository(IntegrationInboxEvent)
                .find({ where: { stream: 'price', entityId: 'pr-1' } });
            expect(rows).toHaveLength(3);
            const byId = new Map(rows.map(r => [r.id, r]));
            expect(byId.get(older1)!.payload).toEqual({});
            expect(byId.get(older2)!.payload).toEqual({});
            expect(byId.get(newest)!.payload).toEqual({ real: 'data' });
        });

        // The HIGH regression this fixes: a purged row's dedup key (stream, sourceEventId) must
        // survive so a genuine Kafka redelivery of that exact message is still recognized as a
        // duplicate, not reprocessed as new.
        it('does not create a new pending row when a tombstoned sourceEventId is redelivered', async () => {
            const older = await enqueueProcessed('pr-redelivered', '1');
            await enqueueProcessed('pr-redelivered', '2');
            await inboxService.purgeSupersededProcessedRows();

            const redelivered = await inboxService.enqueue({
                stream: 'price',
                entityId: 'pr-redelivered',
                version: '1',
                sourceEventId: 'evt-pr-redelivered-1',
                payload: { real: 'data' },
            });

            expect(redelivered.id).toBe(older);
            expect(redelivered.status).toBe('processed');
            const rows = await dataSource
                .getRepository(IntegrationInboxEvent)
                .find({ where: { stream: 'price', entityId: 'pr-redelivered' } });
            expect(rows).toHaveLength(2);
        });

        // Version is compared numerically (isVersionNewer), not lexicographically — "10" must
        // beat "9" even though "10" < "9" as a string.
        it('compares versions numerically, not lexicographically', async () => {
            const older = await enqueueProcessed('pr-numeric', '9');
            const newest = await enqueueProcessed('pr-numeric', '10');

            await inboxService.purgeSupersededProcessedRows();

            const rows = await dataSource
                .getRepository(IntegrationInboxEvent)
                .find({ where: { stream: 'price', entityId: 'pr-numeric' } });
            const byId = new Map(rows.map(r => [r.id, r]));
            expect(byId.get(older)!.payload).toEqual({});
            expect(byId.get(newest)!.payload).toEqual({ real: 'data' });
        });

        it('never touches a pending or processing row, only processed duplicates', async () => {
            const processed = await enqueueProcessed('pr-mixed', '1');
            const pending = await inboxService.enqueue({
                stream: 'price',
                entityId: 'pr-mixed',
                version: '2',
                sourceEventId: 'evt-pr-mixed-pending',
                payload: { real: 'data' },
            });

            const tombstoned = await inboxService.purgeSupersededProcessedRows();

            expect(tombstoned).toBe(0);
            const rows = await dataSource
                .getRepository(IntegrationInboxEvent)
                .find({ where: { stream: 'price', entityId: 'pr-mixed' } });
            const byId = new Map(rows.map(r => [r.id, r]));
            expect(byId.get(processed)!.payload).toEqual({ real: 'data' });
            expect(byId.get(pending.id)!.payload).toEqual({ real: 'data' });
        });

        it('leaves a single processed row alone (no duplicate to tombstone)', async () => {
            const only = await enqueueProcessed('pr-single', '1');

            const tombstoned = await inboxService.purgeSupersededProcessedRows();

            expect(tombstoned).toBe(0);
            const row = await dataSource
                .getRepository(IntegrationInboxEvent)
                .findOneOrFail({ where: { id: only } });
            expect(row.payload).toEqual({ real: 'data' });
        });

        it('does not re-select an already-tombstoned group on a later sweep', async () => {
            await enqueueProcessed('pr-converged', '1');
            const newest = await enqueueProcessed('pr-converged', '2');

            const first = await inboxService.purgeSupersededProcessedRows();
            const second = await inboxService.purgeSupersededProcessedRows();

            expect(first).toBe(1);
            expect(second).toBe(0);
            const row = await dataSource
                .getRepository(IntegrationInboxEvent)
                .findOneOrFail({ where: { id: newest } });
            expect(row.payload).toEqual({ real: 'data' });
        });

        it('keeps entities from different streams independent even sharing an entityId', async () => {
            await enqueueProcessed('shared-id', '1');
            const stockOlder = await inboxService.enqueue({
                stream: 'stock',
                entityId: 'shared-id',
                version: '1',
                sourceEventId: 'evt-shared-stock',
                payload: { real: 'data' },
            });
            await inboxService.markProcessed(stockOlder.id);
            const stockNewest = await inboxService.enqueue({
                stream: 'stock',
                entityId: 'shared-id',
                version: '2',
                sourceEventId: 'evt-shared-stock-2',
                payload: { real: 'data' },
            });
            await inboxService.markProcessed(stockNewest.id);

            await inboxService.purgeSupersededProcessedRows();

            const priceRows = await dataSource
                .getRepository(IntegrationInboxEvent)
                .find({ where: { stream: 'price', entityId: 'shared-id' } });
            const stockRows = await dataSource
                .getRepository(IntegrationInboxEvent)
                .find({ where: { stream: 'stock', entityId: 'shared-id' } });
            expect(priceRows).toHaveLength(1);
            expect(priceRows[0].payload).toEqual({ real: 'data' });
            const stockById = new Map(stockRows.map(r => [r.id, r]));
            expect(stockById.get(stockOlder.id)!.payload).toEqual({});
            expect(stockById.get(stockNewest.id)!.payload).toEqual({ real: 'data' });
        });
    });
});
