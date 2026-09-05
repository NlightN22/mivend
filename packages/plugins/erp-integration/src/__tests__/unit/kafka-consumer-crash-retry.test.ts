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
// dependencies" — kafkajs's own network client is exactly that boundary). connectImpl is
// overridable per created instance (via nextConnectImpl below) so a test can simulate a broker
// that's still down for connectWithBackoff's own internal retries.
class FakeConsumer extends EventEmitter {
    events = CONSUMER_EVENTS;
    connectImpl: () => Promise<void> = async () => undefined;
    connect = vi.fn(() => this.connectImpl());
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
// Applied to the NEXT consumer created (Kafka.consumer() runs synchronously, so this is set
// right before the call that will create it) — undefined means "use FakeConsumer's own default
// (resolves immediately)".
let nextConnectImpl: (() => Promise<void>) | undefined;

vi.mock('kafkajs', () => ({
    Kafka: class {
        consumer(): FakeConsumer {
            const c = new FakeConsumer();
            if (nextConnectImpl) c.connectImpl = nextConnectImpl;
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
        nextConnectImpl = undefined;
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
        expect(createdConsumers[1].subscribe).toHaveBeenCalledTimes(10);
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

    // Regression test: a broker down at boot (connectWithBackoff exhausts its own internal
    // CONNECT_MAX_ATTEMPTS) used to leave the consumer permanently dead — start() just rethrew
    // and nothing else ever retried, since the CRASH-event supervisor only attaches to a
    // consumer that reached consumer.run(), which connectWithBackoff failing never reaches.
    it('schedules a retry when start() itself fails to connect (broker down at boot)', async () => {
        nextConnectImpl = async () => {
            throw new Error('broker down');
        };
        const service = new KafkaConsumerService(makeOptions(), { enqueue: vi.fn() } as never);

        const startPromise = service.start();
        startPromise.catch(() => undefined);
        // Exhausts connectWithBackoff's own internal 8-attempt capped backoff (delays sum to
        // exactly 123s: 1+2+4+8+16+32+60), at which point it throws and start()'s own catch
        // schedules the crash-retry — but that retry's own 1s delay hasn't elapsed yet.
        await vi.advanceTimersByTimeAsync(123_000);
        await expect(startPromise).rejects.toThrow('broker down');
        expect(createdConsumers).toHaveLength(1);

        // The broker recovers — the crash-retry scheduled from start()'s own failure should
        // still fire and succeed.
        nextConnectImpl = undefined;
        await vi.advanceTimersByTimeAsync(1000);
        expect(createdConsumers).toHaveLength(2);
        expect(createdConsumers[1].connect).toHaveBeenCalledTimes(1);
    });

    // The actual bug fixed here: before this fix, scheduleCrashRetry's own setTimeout callback
    // only logged on failure and never rescheduled — a single failed retry attempt was a
    // permanent, silent death (identical to having no crash-retry supervisor at all) rather than
    // a transient setback. This proves the loop keeps going past one failed retry.
    it('keeps retrying indefinitely — a retry that itself fails schedules another retry, not silence', async () => {
        const service = new KafkaConsumerService(makeOptions(), { enqueue: vi.fn() } as never);
        await service.start();
        expect(createdConsumers).toHaveLength(1);

        createdConsumers[0].emitCrash(false);
        nextConnectImpl = async () => {
            throw new Error('still down');
        };
        // Retry #1 fires (creates consumer #2), whose own connectWithBackoff then exhausts
        // (123s, see the previous test) and throws — that failure must schedule retry #2 (delay
        // now 2000ms, attempt count 2), not go quiet.
        await vi.advanceTimersByTimeAsync(1000);
        expect(createdConsumers).toHaveLength(2);
        await vi.advanceTimersByTimeAsync(123_000);
        expect(createdConsumers).toHaveLength(2); // still just the one failed retry consumer so far

        // The broker recovers in time for retry #2.
        nextConnectImpl = undefined;
        await vi.advanceTimersByTimeAsync(2000);
        expect(createdConsumers).toHaveLength(3);
        expect(createdConsumers[2].connect).toHaveBeenCalledTimes(1);
    });
});
