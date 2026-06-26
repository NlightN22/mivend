import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';

import { SyncOutboxEntry } from '../../entities/sync-outbox.entity';
import { SyncProcessedEvent } from '../../entities/sync-processed-event.entity';
import { ProductConsumer } from '../../consumers/product.consumer';
import { SyncService } from '../../sync.service';
import { MAX_RETRY_DEFAULT } from '../../types';
import type { SyncPluginOptions } from '../../types';

const TEST_OPTIONS: SyncPluginOptions = {
    instanceType: 'central',
    instanceId: 'hub',
    redis: { host: 'localhost', port: 6379 },
    rabbitmq: { url: 'amqp://localhost' },
    maxRetry: MAX_RETRY_DEFAULT,
};

const publishMock = vi.fn().mockResolvedValue(undefined);
const mockRabbitMQ = { publish: publishMock, subscribe: vi.fn(), requireChannel: vi.fn() } as never;
const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), dlq: vi.fn() } as never;

let dataSource: DataSource;
let syncService: SyncService;

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

    syncService = new SyncService(dataSource, mockRabbitMQ, TEST_OPTIONS, mockLogger);
});

afterAll(async () => {
    await dataSource.destroy();
});

describe('sync cycle', () => {
    it('writes outbox entry and processOutbox publishes it', async () => {
        const eventId = randomUUID();

        await dataSource.transaction(async em => {
            await syncService.writeToOutbox(
                em,
                {
                    eventId,
                    eventType: 'product.updated',
                    payload: { productId: 'p-1', enabled: true },
                } as never,
                'all-branches',
            );
        });

        const before = await dataSource.getRepository(SyncOutboxEntry).findOneBy({ eventId });
        expect(before?.deliveredAt).toBeNull();
        expect(before?.status).toBe('pending');

        await syncService.processOutbox();

        const after = await dataSource.getRepository(SyncOutboxEntry).findOneBy({ eventId });
        expect(after?.deliveredAt).not.toBeNull();
        expect(after?.status).toBe('delivered');
        expect(publishMock).toHaveBeenCalledWith(
            'product.updated',
            expect.objectContaining({ eventId }),
        );
    });

    it('duplicate eventId in outbox is rejected by unique constraint', async () => {
        const eventId = randomUUID();
        const repo = dataSource.getRepository(SyncOutboxEntry);

        await repo.save(
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
            }),
        );

        await expect(
            repo.save(
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
                }),
            ),
        ).rejects.toThrow();
    });

    it('consumer is idempotent — second call with same eventId is no-op', async () => {
        const branchOptions: SyncPluginOptions = {
            ...TEST_OPTIONS,
            instanceType: 'branch',
            instanceId: 'branch-a',
        };
        const consumer = new ProductConsumer(mockRabbitMQ, dataSource, branchOptions, mockLogger);

        const eventId = randomUUID();
        const event = {
            eventId,
            eventType: 'product.updated' as const,
            sourceInstanceId: 'hub',
            timestamp: new Date().toISOString(),
            payload: { productId: 'p-2', enabled: false },
        };

        await (consumer as unknown as { handleRaw(r: unknown): Promise<void> }).handleRaw(event);
        await (consumer as unknown as { handleRaw(r: unknown): Promise<void> }).handleRaw(event);

        const count = await dataSource.getRepository(SyncProcessedEvent).countBy({ eventId });
        expect(count).toBe(1);
    });
});
