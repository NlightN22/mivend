import { randomUUID } from 'crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';

import { ProductConsumer } from '../../consumers/product.consumer';
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
let consumer: ProductConsumer;

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

    consumer = new ProductConsumer(
        branchRabbitMQ,
        dataSource,
        BRANCH_OPTIONS,
        mockLogger as never,
        { applyUpsert: vi.fn(), applyDeactivation: vi.fn() } as never,
        { applyCreate: vi.fn(), applyUpdate: vi.fn() } as never,
    );
    await consumer.onModuleInit();
});

afterEach(async () => {
    await dataSource.query(`DELETE FROM sync_outbox`);
    await dataSource.query(`DELETE FROM sync_processed_event`);
    await dataSource.query(`DELETE FROM product`);
    await branchRabbitMQ.requireChannel().purgeQueue('sync.branch-a');
    await branchRabbitMQ.requireChannel().purgeQueue('sync.dead-letters');
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
        ch.publish(EXCHANGE, 'product.updated', content, { persistent: true });
        ch.publish(EXCHANGE, 'product.updated', content, { persistent: true });

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
        ch.publish(EXCHANGE, 'product.updated', invalid, { persistent: true });

        await waitFor(async () => {
            const q = await branchRabbitMQ.requireChannel().checkQueue('sync.dead-letters');
            return q.messageCount > 0;
        });

        const q = await branchRabbitMQ.requireChannel().checkQueue('sync.dead-letters');
        expect(q.messageCount).toBeGreaterThan(0);

        const mainQ = await branchRabbitMQ.requireChannel().checkQueue('sync.branch-a');
        expect(mainQ.messageCount).toBe(0);
    });
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
