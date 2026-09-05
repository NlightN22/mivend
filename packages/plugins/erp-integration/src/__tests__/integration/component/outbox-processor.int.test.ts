import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { IntegrationOutboxEntry } from '../../../entities/integration-outbox-entry.entity';
import { IntegrationOutboxProcessorService } from '../../../integration-outbox-processor.service';
import type { ErpIntegrationPluginOptions } from '../../../types';

// Component chain: pending row -> sweep -> publish -> published / retry / dead-letter. Invoked
// directly (processPendingBatch), never waiting on a real BullMQ scheduler interval, per
// docs/testing-strategy.md's "Worker testing". KafkaProducerService.publish is mocked — this
// suite proves the outbox lifecycle transitions, not real Kafka connectivity (see this plugin's
// test plan's "Deliberate omissions": no live broker in this repo's test infra).
const OPTIONS: ErpIntegrationPluginOptions = {
    instanceType: 'central',
    kafka: { brokers: ['localhost:9092'], clientId: 'test', topic: 'mivend.erp-integration' },
    kafkaConsumer: {
        brokers: ['localhost:9092'],
        clientId: 'test-consumer',
        groupId: 'test-group',
        topics: {
            category: 't-category',
            organization: 't-organization',
            warehouse: 't-warehouse',
            'price-type': 't-price-type',
            product: 't-product',
            offer: 't-offer',
            price: 't-price',
            stock: 't-stock',
            'storage-location': 't-storage-location',
            'stock-organization': 't-stock-organization',
        },
    },
    schemaRegistry: { url: 'http://localhost:8081' },
    redis: { host: 'localhost', port: 6379 },
    maxRetry: 3,
};

let dataSource: DataSource;
const publish = vi.fn();

const { schema, extra } = testSchemaOptions('erp_integration_outbox_processor');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [IntegrationOutboxEntry],
        synchronize: true,
    });
    await dataSource.initialize();
});

afterEach(async () => {
    await dataSource.getRepository(IntegrationOutboxEntry).clear();
    publish.mockReset();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

function makeProcessor(): IntegrationOutboxProcessorService {
    return new IntegrationOutboxProcessorService(dataSource, { publish } as never, OPTIONS);
}

async function insertPending(
    overrides: Partial<IntegrationOutboxEntry> = {},
): Promise<IntegrationOutboxEntry> {
    const repo = dataSource.getRepository(IntegrationOutboxEntry);
    const entry = repo.create({
        eventId: overrides.eventId ?? randomUUID(),
        eventType: 'order.submitted',
        payload: { orderId: 'order-1' },
        status: 'pending',
        retryCount: 0,
        ...overrides,
    });
    return repo.save(entry);
}

describe('IntegrationOutboxProcessorService.processPendingBatch (component)', () => {
    it('publishes a pending row and marks it published', async () => {
        publish.mockResolvedValueOnce(undefined);
        const entry = await insertPending();

        await makeProcessor().processPendingBatch();

        const reloaded = await dataSource.getRepository(IntegrationOutboxEntry).findOneOrFail({
            where: { id: entry.id },
        });
        expect(reloaded.status).toBe('published');
        expect(reloaded.publishedAt).not.toBeNull();
        expect(publish).toHaveBeenCalledWith(entry.eventId, 'order.submitted', {
            orderId: 'order-1',
        });
    });

    it('a publish failure keeps the row pending and records the error, incrementing retryCount', async () => {
        publish.mockRejectedValueOnce(new Error('broker unreachable'));
        const entry = await insertPending();

        await makeProcessor().processPendingBatch();

        const reloaded = await dataSource.getRepository(IntegrationOutboxEntry).findOneOrFail({
            where: { id: entry.id },
        });
        expect(reloaded.status).toBe('pending');
        expect(reloaded.retryCount).toBe(1);
        expect(reloaded.lastError).toContain('broker unreachable');
    });

    it('a row already at maxRetry-1 becomes failed (dead-lettered) on the next failure, not retried again', async () => {
        publish.mockRejectedValueOnce(new Error('still down'));
        const entry = await insertPending({ retryCount: OPTIONS.maxRetry! - 1 });

        await makeProcessor().processPendingBatch();

        const reloaded = await dataSource.getRepository(IntegrationOutboxEntry).findOneOrFail({
            where: { id: entry.id },
        });
        expect(reloaded.status).toBe('failed');
        expect(reloaded.retryCount).toBe(OPTIONS.maxRetry);

        // A second sweep must not touch the now-'failed' row at all — it's excluded by the
        // `where: { status: 'pending' }` query, not re-evaluated and re-failed.
        publish.mockClear();
        await makeProcessor().processPendingBatch();
        expect(publish).not.toHaveBeenCalled();
    });

    it('does not publish an already-published row again on a later sweep', async () => {
        await insertPending({ status: 'published' });

        await makeProcessor().processPendingBatch();

        expect(publish).not.toHaveBeenCalled();
    });
});
