import { afterEach, describe, expect, it, vi } from 'vitest';

import { SchemaRegistryClient } from '../../schema-registry.client';
import type { ErpIntegrationPluginOptions } from '../../types';

const OPTIONS: ErpIntegrationPluginOptions = {
    instanceType: 'central',
    kafka: { brokers: ['localhost:9092'], clientId: 'test', topic: 'topic' },
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
        },
    },
    schemaRegistry: { url: 'http://registry.test' },
    redis: { host: 'localhost', port: 6379 },
};

afterEach(() => {
    vi.unstubAllGlobals();
});

// This client is now producer-side only, for the OUTBOUND OrderSubmitted event — see
// schema-registry.client.ts's class comment. Registry unavailability (issue #62 test-design risk)
// must throw (never crash the process, never silently invent a schema id) so the outbox processor
// treats it as retryable, not as "this event is invalid".
describe('SchemaRegistryClient.resolveSchemaId', () => {
    it('resolves and caches the schema id for a given subject', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ id: 7 }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const client = new SchemaRegistryClient(OPTIONS);
        const id = await client.resolveSchemaId('mivend.orders.events.v1.order-submitted', {
            type: 'object',
        });
        expect(id).toBe(7);

        await client.resolveSchemaId('mivend.orders.events.v1.order-submitted', {
            type: 'object',
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('throws (does not swallow) when the Registry is unreachable', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => 'down' }),
        );
        const client = new SchemaRegistryClient(OPTIONS);
        await expect(
            client.resolveSchemaId('mivend.orders.events.v1.order-submitted', { type: 'object' }),
        ).rejects.toThrow(/503/);
    });
});
