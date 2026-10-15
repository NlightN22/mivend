import { EventEmitter } from 'events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CONSUMER_EVENTS = {
    CONNECT: 'consumer.connect',
    DISCONNECT: 'consumer.disconnect',
    CRASH: 'consumer.crash',
};

// connectImpl is overridable per instance (via nextConnectImpl) so a test can simulate
// a broker still down during connectWithBackoff's internal retries.
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

    emitConnect(): void {
        this.emit(CONSUMER_EVENTS.CONNECT);
    }
}

const createdConsumers: FakeConsumer[] = [];
// Consumed by the next Kafka.consumer() call, which runs synchronously, so it must be set
// immediately before that call.
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
        kafka: { brokers: ['x'], clientId: 'x' },
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
        const service = new KafkaConsumerService(
            makeOptions(),
            { enqueue: vi.fn() } as never,
            { getRepository: () => ({ upsert: vi.fn().mockResolvedValue(undefined) }) } as never,
        );
        await service.start();
        expect(createdConsumers).toHaveLength(1);

        createdConsumers[0].emitCrash(false);
        await vi.advanceTimersByTimeAsync(1000);

        expect(createdConsumers).toHaveLength(2);
        expect(createdConsumers[1].connect).toHaveBeenCalledTimes(1);
        expect(createdConsumers[1].subscribe).toHaveBeenCalledTimes(10);
    });

    it('does not schedule its own reconnect when kafkajs itself is restarting (restart: true)', async () => {
        const service = new KafkaConsumerService(
            makeOptions(),
            { enqueue: vi.fn() } as never,
            { getRepository: () => ({ upsert: vi.fn().mockResolvedValue(undefined) }) } as never,
        );
        await service.start();

        createdConsumers[0].emitCrash(true);
        await vi.advanceTimersByTimeAsync(60_000);

        expect(createdConsumers).toHaveLength(1);
    });

    it('caps backoff at 60s across repeated non-retriable crashes', async () => {
        const service = new KafkaConsumerService(
            makeOptions(),
            { enqueue: vi.fn() } as never,
            { getRepository: () => ({ upsert: vi.fn().mockResolvedValue(undefined) }) } as never,
        );
        await service.start();

        for (let i = 0; i < 8; i++) {
            const current = createdConsumers[createdConsumers.length - 1];
            current.emitCrash(false);
            await vi.advanceTimersByTimeAsync(60_000);
        }

        expect(createdConsumers).toHaveLength(9);
    });

    it('cancels a pending crash-retry on module destroy — no reconnect after shutdown', async () => {
        const service = new KafkaConsumerService(
            makeOptions(),
            { enqueue: vi.fn() } as never,
            { getRepository: () => ({ upsert: vi.fn().mockResolvedValue(undefined) }) } as never,
        );
        await service.start();

        createdConsumers[0].emitCrash(false);
        await service.onModuleDestroy();
        await vi.advanceTimersByTimeAsync(60_000);

        expect(createdConsumers).toHaveLength(1);
    });

    // The CRASH supervisor only attaches after consumer.run(), which a failed connectWithBackoff
    // never reaches, so a boot-time broker outage needs start()'s own retry path.
    it('schedules a retry when start() itself fails to connect (broker down at boot)', async () => {
        nextConnectImpl = async () => {
            throw new Error('broker down');
        };
        const service = new KafkaConsumerService(
            makeOptions(),
            { enqueue: vi.fn() } as never,
            { getRepository: () => ({ upsert: vi.fn().mockResolvedValue(undefined) }) } as never,
        );

        const startPromise = service.start();
        startPromise.catch(() => undefined);
        // Burns through connectWithBackoff's 8 attempts (delays total 123s), so start()'s catch
        // schedules the crash-retry while its 1s delay is still pending.
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

    // The timer callback in scheduleCrashRetry must reschedule itself on failure; logging only
    // made a single failed retry a permanent silent death.
    it('keeps retrying indefinitely — a retry that itself fails schedules another retry, not silence', async () => {
        const service = new KafkaConsumerService(
            makeOptions(),
            { enqueue: vi.fn() } as never,
            { getRepository: () => ({ upsert: vi.fn().mockResolvedValue(undefined) }) } as never,
        );
        await service.start();
        expect(createdConsumers).toHaveLength(1);

        createdConsumers[0].emitCrash(false);
        nextConnectImpl = async () => {
            throw new Error('still down');
        };
        // A failure during retry #1 (connectWithBackoff exhausts) must schedule retry #2
        // with the doubled 2000ms delay, not go quiet.
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

    // Read from the DB row, not isConnected(): the in-memory flag is invisible to the
    // separate HTTP process that serves KafkaStatusController.
    it('persists connected: true on CONNECT and connected: false on CRASH', async () => {
        const upsert = vi.fn().mockResolvedValue(undefined);
        const dataSource = { getRepository: () => ({ upsert }) };
        const service = new KafkaConsumerService(
            makeOptions(),
            { enqueue: vi.fn() } as never,
            dataSource as never,
        );

        await service.start();
        createdConsumers[0].emitConnect();
        expect(upsert).toHaveBeenCalledWith(
            { key: 'default', connected: true },
            { conflictPaths: ['key'] },
        );

        createdConsumers[0].emitCrash(false);
        expect(upsert).toHaveBeenCalledWith(
            { key: 'default', connected: false },
            { conflictPaths: ['key'] },
        );
    });
});
