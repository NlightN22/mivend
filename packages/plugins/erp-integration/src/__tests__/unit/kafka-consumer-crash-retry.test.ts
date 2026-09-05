import { EventEmitter } from 'events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CONSUMER_EVENTS = {
    CONNECT: 'consumer.connect',
    DISCONNECT: 'consumer.disconnect',
    CRASH: 'consumer.crash',
};

// A fake kafkajs Consumer just real enough to drive KafkaConsumerService's supervisor: connect()/
// subscribe()/run() are spies, and emitCrash()/emitConnect() let a test author drive its
// lifecycle without a real broker (docs/testing-strategy.md's "mock only real external
// dependencies" — kafkajs's own network client is exactly that boundary).
class FakeConsumer extends EventEmitter {
    events = CONSUMER_EVENTS;
    connect = vi.fn().mockResolvedValue(undefined);
    subscribe = vi.fn().mockResolvedValue(undefined);
    run = vi.fn().mockResolvedValue(undefined);
    disconnect = vi.fn().mockResolvedValue(undefined);

    emitCrash(restart: boolean): void {
        this.emit(CONSUMER_EVENTS.CRASH, {
            payload: { restart, error: new Error('x'), groupId: 'g' },
        });
    }
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
            },
        },
        schemaRegistry: { url: 'http://x' },
        redis: { host: 'x', port: 1 },
    } as ErpIntegrationPluginOptions;
}

describe('KafkaConsumerService crash-retry supervisor', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        createdConsumers.length = 0;
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('reconnects with a fresh consumer after a non-retriable crash (restart: false)', async () => {
        const service = new KafkaConsumerService(makeOptions(), { enqueue: vi.fn() } as never);
        await service.start();
        expect(createdConsumers).toHaveLength(1);

        createdConsumers[0].emitCrash(false);
        await vi.advanceTimersByTimeAsync(1000);

        expect(createdConsumers).toHaveLength(2);
        expect(createdConsumers[1].connect).toHaveBeenCalledTimes(1);
        expect(createdConsumers[1].subscribe).toHaveBeenCalledTimes(8);
    });

    it('does not schedule its own reconnect when kafkajs itself is restarting (restart: true)', async () => {
        const service = new KafkaConsumerService(makeOptions(), { enqueue: vi.fn() } as never);
        await service.start();

        createdConsumers[0].emitCrash(true);
        await vi.advanceTimersByTimeAsync(60_000);

        expect(createdConsumers).toHaveLength(1);
    });

    it('caps backoff at 60s across repeated non-retriable crashes', async () => {
        const service = new KafkaConsumerService(makeOptions(), { enqueue: vi.fn() } as never);
        await service.start();

        for (let i = 0; i < 8; i++) {
            const current = createdConsumers[createdConsumers.length - 1];
            current.emitCrash(false);
            await vi.advanceTimersByTimeAsync(60_000);
        }

        expect(createdConsumers).toHaveLength(9);
    });

    it('cancels a pending crash-retry on module destroy — no reconnect after shutdown', async () => {
        const service = new KafkaConsumerService(makeOptions(), { enqueue: vi.fn() } as never);
        await service.start();

        createdConsumers[0].emitCrash(false);
        await service.onModuleDestroy();
        await vi.advanceTimersByTimeAsync(60_000);

        expect(createdConsumers).toHaveLength(1);
    });
});
