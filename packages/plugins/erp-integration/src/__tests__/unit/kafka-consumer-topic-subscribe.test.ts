import { EventEmitter } from 'events';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const CONSUMER_EVENTS = {
    CONNECT: 'consumer.connect',
    DISCONNECT: 'consumer.disconnect',
    CRASH: 'consumer.crash',
};

// Same fake shape as kafka-consumer-crash-retry.test.ts's own FakeConsumer — subscribe is
// per-call rejectable here (via subscribeImpl) to drive the per-topic isolation this test covers.
class FakeConsumer extends EventEmitter {
    events = CONSUMER_EVENTS;
    connect = vi.fn().mockResolvedValue(undefined);
    run = vi.fn().mockResolvedValue(undefined);
    disconnect = vi.fn().mockResolvedValue(undefined);
    subscribeImpl: (args: { topic: string }) => Promise<void> = async () => undefined;
    subscribe = vi.fn((args: { topic: string }) => this.subscribeImpl(args));
}

const createdConsumers: FakeConsumer[] = [];

vi.mock('kafkajs', () => ({
    Kafka: class {
        consumer(): FakeConsumer {
            const c = new FakeConsumer();
            createdConsumers.push(c);
            return c;
        }
    },
}));

// Imported after the mock so KafkaConsumerService picks up the mocked `Kafka`.
import { KafkaConsumerService } from '../../kafka-consumer.service';
import type { ErpIntegrationPluginOptions } from '../../types';

function makeOptions(): ErpIntegrationPluginOptions {
    return {
        instanceType: 'central',
        kafkaEnabled: true,
        kafka: { brokers: ['x'], clientId: 'x', topic: 'x' },
        kafkaConsumer: {
            brokers: ['x'],
            clientId: 'x',
            groupId: 'mivend-central-hub',
            topics: {
                category: 'c',
                organization: 'o',
                warehouse: 'w',
                'price-type': 'pt',
                product: 'p',
                offer: 'of',
                price: 'pr',
                stock: 's',
                'storage-location': 'sl',
                'stock-organization': 'so',
                'order-registration-result': 'orr',
                'order-changed': 'oc',
                department: 'dept',
                counterparty: 'cp',
                'counterparty-credit-balance': 'cpcb',
                user: 'usr',
                'promo-rule': 'pr2',
            },
        },
        schemaRegistry: { url: 'http://x' },
    };
}

describe('KafkaConsumerService per-topic subscribe isolation', () => {
    beforeEach(() => {
        createdConsumers.length = 0;
    });

    it('subscribes to every topic and calls run() when all succeed (no regression)', async () => {
        const service = new KafkaConsumerService(
            makeOptions(),
            { enqueue: vi.fn() } as never,
            { getRepository: () => ({ upsert: vi.fn().mockResolvedValue(undefined) }) } as never,
        );
        await service.start();

        expect(createdConsumers[0].subscribe).toHaveBeenCalledTimes(17);
        expect(createdConsumers[0].run).toHaveBeenCalledTimes(1);
    });

    // Regression case for the live incident: an ACL denial on storage-location/stock-organization
    // used to throw out of the whole subscribe loop before consumer.run() was ever reached,
    // silently halting consumption of every other, perfectly healthy topic too.
    it('skips a topic whose subscribe() rejects (e.g. ACL denial) and still consumes the rest', async () => {
        const service = new KafkaConsumerService(
            makeOptions(),
            { enqueue: vi.fn() } as never,
            { getRepository: () => ({ upsert: vi.fn().mockResolvedValue(undefined) }) } as never,
        );
        const consumerPromise = service.start();

        // subscribeImpl is only assigned once the fake Consumer exists — start() awaits connect()
        // first (a resolved mock), so by the time subscribe() is actually called the consumer is
        // already in createdConsumers. Set it synchronously before awaiting, since connect()
        // resolves on the same microtask queue turn.
        await Promise.resolve();
        createdConsumers[0].subscribeImpl = async ({ topic }) => {
            if (topic === 'sl') {
                throw new Error('Not authorized to access topics: [Topic authorization failed]');
            }
        };

        await consumerPromise;

        expect(createdConsumers[0].subscribe).toHaveBeenCalledTimes(17);
        // run() must still be reached even though one subscribe() rejected.
        expect(createdConsumers[0].run).toHaveBeenCalledTimes(1);
    });

    it('still calls run() (idle, not a crash) when every topic fails to subscribe', async () => {
        const service = new KafkaConsumerService(
            makeOptions(),
            { enqueue: vi.fn() } as never,
            { getRepository: () => ({ upsert: vi.fn().mockResolvedValue(undefined) }) } as never,
        );
        const consumerPromise = service.start();

        await Promise.resolve();
        createdConsumers[0].subscribeImpl = async () => {
            throw new Error('Not authorized to access topics: [Topic authorization failed]');
        };

        await expect(consumerPromise).resolves.toBeUndefined();
        expect(createdConsumers[0].run).toHaveBeenCalledTimes(1);
    });
});
