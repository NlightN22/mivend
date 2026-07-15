import { randomUUID } from 'crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';

import { ProductConsumer } from '../../consumers/product.consumer';
import { CentralConsumer } from '../../consumers/central.consumer';
import { SyncOutboxEntry } from '../../entities/sync-outbox.entity';
import { SyncProcessedEvent } from '../../entities/sync-processed-event.entity';
import { RabbitMQService } from '../../rabbitmq.service';
import { SyncService } from '../../sync.service';
import { EXCHANGE } from '../../types';
import type { SyncPluginOptions } from '../../types';

const RABBITMQ_URL = process.env['RABBITMQ_URL'] ?? 'amqp://mivend:mivend@localhost:5672';

const HUB_OPTIONS: SyncPluginOptions = {
    instanceType: 'central',
    instanceId: 'hub',
    redis: { host: 'localhost', port: 6379 },
    rabbitmq: { url: RABBITMQ_URL },
    maxRetry: 3,
};

const BRANCH_OPTIONS: SyncPluginOptions = {
    ...HUB_OPTIONS,
    instanceType: 'branch',
    instanceId: 'branch-a',
};

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), dlq: vi.fn() };

async function waitFor(
    check: () => Promise<boolean>,
    timeoutMs = 8_000,
    intervalMs = 150,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await check()) return;
        await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error(`Condition not met within ${timeoutMs}ms`);
}

let dataSource: DataSource;
let hubRabbitMQ: RabbitMQService;
let branchRabbitMQ: RabbitMQService;
let syncService: SyncService;
let branchSyncService: SyncService;
let consumer: ProductConsumer;
let centralConsumer: CentralConsumer;
let centralOrderSyncMock: {
    applyCreate: ReturnType<typeof vi.fn>;
    applyUpdate: ReturnType<typeof vi.fn>;
};

beforeAll(async () => {
    dataSource = new DataSource({
        type: 'postgres',
        host: process.env['TEST_DB_HOST'] ?? 'localhost',
        port: Number(process.env['TEST_DB_PORT'] ?? 5432),
        username: process.env['TEST_DB_USER'] ?? 'postgres',
        password: process.env['TEST_DB_PASSWORD'] ?? 'postgres',
        database: process.env['TEST_DB_NAME'] ?? 'mivend_test',
        entities: [SyncOutboxEntry, SyncProcessedEvent],
        synchronize: true,
        dropSchema: true,
    });
    await dataSource.initialize();

    // Minimal product table for consumer UPDATE queries
    await dataSource.query(`
        CREATE TABLE IF NOT EXISTS product (
            id VARCHAR PRIMARY KEY,
            enabled BOOLEAN NOT NULL DEFAULT true,
            deleted_at TIMESTAMPTZ
        )
    `);

    hubRabbitMQ = new RabbitMQService(HUB_OPTIONS, mockLogger as never);
    await hubRabbitMQ.connect();

    branchRabbitMQ = new RabbitMQService(BRANCH_OPTIONS, mockLogger as never);
    await branchRabbitMQ.connect();

    syncService = new SyncService(dataSource, hubRabbitMQ, HUB_OPTIONS, mockLogger as never);
    // Publishes as if from branch-a (sourceInstanceId='branch-a') — used to simulate a
    // branch-originated event reaching Central. Using `syncService` (sourceInstanceId='hub')
    // for that would make the event look like Central's own echo of itself, since
    // CentralConsumer's self-echo guard compares sourceInstanceId against its own instanceId.
    branchSyncService = new SyncService(
        dataSource,
        branchRabbitMQ,
        BRANCH_OPTIONS,
        mockLogger as never,
    );

    consumer = new ProductConsumer(
        branchRabbitMQ,
        dataSource,
        BRANCH_OPTIONS,
        mockLogger as never,
        { applyUpsert: vi.fn(), applyDeactivation: vi.fn() } as never,
        { applyCreate: vi.fn(), applyUpdate: vi.fn() } as never,
    );
    await consumer.onModuleInit();

    centralOrderSyncMock = {
        applyCreate: vi.fn(async () => undefined),
        applyUpdate: vi.fn(async () => undefined),
    };
    centralConsumer = new CentralConsumer(
        hubRabbitMQ,
        dataSource,
        HUB_OPTIONS,
        mockLogger as never,
        centralOrderSyncMock as never,
    );
    await centralConsumer.onModuleInit();
});

afterEach(async () => {
    await dataSource.query(`DELETE FROM sync_outbox`);
    await dataSource.query(`DELETE FROM sync_processed_event`);
    await dataSource.query(`DELETE FROM product`);
    await branchRabbitMQ.requireChannel().purgeQueue('sync.branch-a');
    await branchRabbitMQ.requireChannel().purgeQueue('sync.dead-letters');
    await hubRabbitMQ.requireChannel().purgeQueue('sync.hub');
    await hubRabbitMQ
        .requireChannel()
        .deleteQueue('test.poison-message')
        .catch(() => undefined);
    vi.clearAllMocks();
});

afterAll(async () => {
    await hubRabbitMQ.onModuleDestroy();
    await branchRabbitMQ.onModuleDestroy();
    await dataSource.destroy();
});

// ─── Outbox → RabbitMQ ────────────────────────────────────────────────────────

describe('outbox publishing', () => {
    it('publishes pending entry and marks it delivered', async () => {
        const eventId = randomUUID();
        await dataSource.transaction(async em => {
            await syncService.writeToOutbox(
                em,
                { eventId, eventType: 'product.updated', payload: { productId: 'p-1' } } as never,
                'all-branches',
            );
        });

        await syncService.processOutbox();

        const entry = await dataSource.getRepository(SyncOutboxEntry).findOneBy({ eventId });
        expect(entry?.status).toBe('delivered');
        expect(entry?.deliveredAt).not.toBeNull();
    });

    it('marks entry failed and calls dlq after maxRetry exhausted', async () => {
        const fastOptions: SyncPluginOptions = { ...HUB_OPTIONS, maxRetry: 2 };
        const fastService = new SyncService(
            dataSource,
            hubRabbitMQ,
            fastOptions,
            mockLogger as never,
        );

        // Invalid payload — SyncEventSchema.parse() will throw on publish
        const repo = dataSource.getRepository(SyncOutboxEntry);
        const entry = repo.create({
            eventId: randomUUID(),
            eventType: 'product.updated',
            payload: {},
            target: 'all-branches',
            status: 'pending',
            deliveredAt: null,
            retryCount: 0,
            lastError: null,
            lastErrorAt: null,
        });
        await repo.save(entry);

        await fastService.processOutbox();
        await fastService.processOutbox();

        const updated = await repo.findOneBy({ eventId: entry.eventId });
        expect(updated?.status).toBe('failed');
        expect(updated?.retryCount).toBe(2);
        expect(mockLogger.dlq).toHaveBeenCalledWith(entry.eventId, expect.any(String));
    });

    it('rejects duplicate eventId via unique constraint', async () => {
        const eventId = randomUUID();
        const repo = dataSource.getRepository(SyncOutboxEntry);
        const make = (): SyncOutboxEntry =>
            repo.create({
                eventId,
                eventType: 'product.updated',
                payload: {},
                target: 'all-branches',
                status: 'pending',
                deliveredAt: null,
                retryCount: 0,
                lastError: null,
                lastErrorAt: null,
            });

        await repo.save(make());
        await expect(repo.save(make())).rejects.toThrow();
    });
});

// ─── RabbitMQ → consumer → DB ────────────────────────────────────────────────

describe('branch consumer', () => {
    it('full cycle: outbox → RabbitMQ → consumer applies change to DB', async () => {
        const productId = randomUUID();
        await dataSource.query(`INSERT INTO product (id, enabled) VALUES ($1, true)`, [productId]);

        const eventId = randomUUID();
        await dataSource.transaction(async em => {
            await syncService.writeToOutbox(
                em,
                {
                    eventId,
                    eventType: 'product.updated',
                    payload: { productId, enabled: false },
                } as never,
                'all-branches',
            );
        });

        await syncService.processOutbox();

        await waitFor(async () => {
            const count = await dataSource.getRepository(SyncProcessedEvent).countBy({ eventId });
            return count === 1;
        });

        const [row] = await dataSource.query<Array<{ enabled: boolean }>>(
            `SELECT enabled FROM product WHERE id = $1`,
            [productId],
        );
        expect(row?.enabled).toBe(false);
    });

    it('idempotent: duplicate message does not double-process', async () => {
        const eventId = randomUUID();
        const event = {
            eventId,
            eventType: 'product.updated' as const,
            sourceInstanceId: 'hub',
            timestamp: new Date().toISOString(),
            payload: { productId: randomUUID(), enabled: true },
        };

        const ch = hubRabbitMQ.requireChannel();
        const content = Buffer.from(JSON.stringify(event));
        ch.publish(EXCHANGE, 'product.updated.all-branches', content, { persistent: true });
        ch.publish(EXCHANGE, 'product.updated.all-branches', content, { persistent: true });

        await waitFor(async () => {
            const count = await dataSource.getRepository(SyncProcessedEvent).countBy({ eventId });
            return count === 1;
        });

        const total = await dataSource.getRepository(SyncProcessedEvent).countBy({ eventId });
        expect(total).toBe(1);
    });

    it('invalid schema message goes to dead-letters without requeue', async () => {
        const ch = hubRabbitMQ.requireChannel();
        const invalid = Buffer.from(JSON.stringify({ not: 'a valid sync event' }));
        ch.publish(EXCHANGE, 'product.updated.all-branches', invalid, { persistent: true });

        await waitFor(async () => {
            const q = await branchRabbitMQ.requireChannel().checkQueue('sync.dead-letters');
            return q.messageCount > 0;
        });

        const q = await branchRabbitMQ.requireChannel().checkQueue('sync.dead-letters');
        expect(q.messageCount).toBeGreaterThan(0);

        const mainQ = await branchRabbitMQ.requireChannel().checkQueue('sync.branch-a');
        expect(mainQ.messageCount).toBe(0);
    });

    // Real incident this test guards against: a schema-valid message whose business logic
    // keeps failing (see erp-adapter.stub.ts's productId fix) was nack(requeue=true)'d
    // instantly and indefinitely — a tight loop with no delay and no cap, fast enough to
    // exhaust host memory. Retries must be backed off and capped at maxRetry, landing in
    // dead-letters afterward — never looping forever.
    it('a still-failing (non-schema) message retries with backoff, then lands in dead-letters — never loops forever', async () => {
        const queueName = 'test.poison-message';
        let attempts = 0;
        await hubRabbitMQ.subscribe(queueName, 'poison.test', async () => {
            attempts++;
            throw new Error('simulated persistent failure — not a ZodError');
        });

        const event = {
            eventId: randomUUID(),
            eventType: 'product.updated' as const,
            sourceInstanceId: 'hub',
            timestamp: new Date().toISOString(),
            payload: { productId: randomUUID(), enabled: true },
        };
        hubRabbitMQ
            .requireChannel()
            .publish(EXCHANGE, 'poison.test', Buffer.from(JSON.stringify(event)), {
                persistent: true,
            });

        await waitFor(
            async () => {
                const q = await hubRabbitMQ.requireChannel().checkQueue('sync.dead-letters');
                return q.messageCount > 0;
            },
            15_000,
            300,
        );

        // Exactly maxRetry (3) attempts — not more (would mean the cap didn't hold) and not
        // fewer (would mean it gave up early or never retried at all).
        expect(attempts).toBe(HUB_OPTIONS.maxRetry);
        const mainQ = await hubRabbitMQ.requireChannel().checkQueue(queueName);
        expect(mainQ.messageCount).toBe(0);
    }, 20_000);
});

// ─── Batch processing ─────────────────────────────────────────────────────────

describe('batch processing', () => {
    it('processes product.created, product.updated, product.deleted in sequence', async () => {
        const productId = randomUUID();

        await dataSource.transaction(async em => {
            await syncService.writeToOutbox(
                em,
                {
                    eventType: 'product.created',
                    payload: { productId, slug: 'test', name: 'Test', enabled: true },
                } as never,
                'all-branches',
            );
            await syncService.writeToOutbox(
                em,
                {
                    eventType: 'product.updated',
                    payload: { productId, enabled: false },
                } as never,
                'all-branches',
            );
            await syncService.writeToOutbox(
                em,
                { eventType: 'product.deleted', payload: { productId } } as never,
                'all-branches',
            );
        });

        await syncService.processOutbox();

        await waitFor(async () => {
            const count = await dataSource.getRepository(SyncProcessedEvent).count();
            return count === 3;
        });

        const delivered = await dataSource
            .getRepository(SyncOutboxEntry)
            .countBy({ status: 'delivered' });
        expect(delivered).toBe(3);
    });
});

// ─── Central consumer (Branch → Central) ─────────────────────────────────────
// Central previously never subscribed to RabbitMQ at all (only published) — a branch-originated
// event had nowhere to land. These tests exercise the routing-key redesign this was built on:
// each queue binds only to the target patterns it actually needs, not a bare `#` — see
// RabbitMQService.subscribe's comment for why "bind everything and filter in code" was rejected.
describe('central consumer', () => {
    it('applies an order.created event targeted at "central" (a branch-originated order)', async () => {
        const eventId = randomUUID();
        await dataSource.transaction(em =>
            branchSyncService.writeToOutbox(
                em,
                {
                    eventId,
                    eventType: 'order.created',
                    payload: {
                        sourceOrderId: 'branch-order-1',
                        orderCode: 'ORD-BRANCH-1',
                        customerEmail: 'ivan@example.com',
                        branchId: 'branch-a',
                        lines: [{ sku: 'SKU-1', quantity: 1, unitPrice: 500 }],
                    },
                },
                'central',
            ),
        );

        await branchSyncService.processOutbox();

        await waitFor(async () => {
            const count = await dataSource.getRepository(SyncProcessedEvent).countBy({ eventId });
            return count === 1;
        });

        expect(centralOrderSyncMock.applyCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                payload: expect.objectContaining({ sourceOrderId: 'branch-order-1' }),
            }),
        );
    });

    it('never receives an administrator.created broadcast — bound only to *.central, not #', async () => {
        const ch = hubRabbitMQ.requireChannel();
        const event = {
            eventId: randomUUID(),
            eventType: 'administrator.created' as const,
            sourceInstanceId: 'hub',
            timestamp: new Date().toISOString(),
            payload: {
                administratorId: 'a1',
                emailAddress: 'a@example.com',
                firstName: 'A',
                lastName: 'B',
                roleCodes: ['operator'],
                passwordHash: 'hash',
                branchId: null,
            },
        };
        ch.publish(
            EXCHANGE,
            'administrator.created.all-branches',
            Buffer.from(JSON.stringify(event)),
            {
                persistent: true,
            },
        );

        // Give it a moment to (not) arrive — there's no positive event to waitFor here, so a
        // short fixed wait is the only option; the real assertion is the queue's message count.
        await new Promise(r => setTimeout(r, 500));

        expect(centralOrderSyncMock.applyCreate).not.toHaveBeenCalled();
        const centralQ = await hubRabbitMQ.requireChannel().checkQueue('sync.hub');
        expect(centralQ.messageCount).toBe(0);
    });
});
