import { EventEmitter } from 'events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { testRequestContextService } from '../test-request-context-service';

const EVENTS = {
    CONNECT: 'consumer.connect',
    DISCONNECT: 'consumer.disconnect',
    CRASH: 'consumer.crash',
    STOP: 'consumer.stop',
};

class FakeConsumer extends EventEmitter {
    events = EVENTS;
    connect = vi.fn().mockResolvedValue(undefined);
    subscribe = vi.fn().mockResolvedValue(undefined);
    run = vi.fn(() => (runError ? Promise.reject(runError) : Promise.resolve()));
    disconnect = vi.fn().mockResolvedValue(undefined);
}

const created: FakeConsumer[] = [];
let runError: Error | undefined;

vi.mock('kafkajs', () => ({
    Kafka: class {
        consumer(): FakeConsumer {
            const c = new FakeConsumer();
            created.push(c);
            return c;
        }
    },
}));
vi.mock('fs/promises', () => ({
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
}));

import { KafkaConsumerService } from '../../kafka-consumer.service';
import type { ErpIntegrationPluginOptions } from '../../types';

const options = {
    instanceType: 'central',
    kafkaEnabled: true,
    kafka: { brokers: ['x'], clientId: 'x' },
    kafkaConsumer: {
        brokers: ['x'],
        clientId: 'x',
        groupId: 'g',
        topics: { category: 'c' },
    },
    schemaRegistry: { url: 'http://x' },
} as unknown as ErpIntegrationPluginOptions;

function makeService(upsert: ReturnType<typeof vi.fn>): KafkaConsumerService {
    return new KafkaConsumerService(
        options,
        { enqueue: vi.fn() } as never,
        { getRepository: () => ({ upsert }) } as never,
        testRequestContextService,
    );
}

describe('KafkaConsumerService stall watchdog and status persistence', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        created.length = 0;
        runError = undefined;
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('rebuilds the consumer when the runner stops without a crash and never reconnects', async () => {
        const service = makeService(vi.fn().mockResolvedValue(undefined));
        await service.start();
        created[0].emit(EVENTS.CONNECT);

        created[0].emit(EVENTS.STOP);
        await vi.advanceTimersByTimeAsync(119_000);
        expect(created).toHaveLength(1);

        await vi.advanceTimersByTimeAsync(2_000);
        await vi.advanceTimersByTimeAsync(1_000);
        expect(created).toHaveLength(2);
        expect(created[0].disconnect).toHaveBeenCalled();
        expect(service.isConnected()).toBe(false);
    });

    it('does not rebuild when kafkajs reconnects within the window', async () => {
        const service = makeService(vi.fn().mockResolvedValue(undefined));
        await service.start();
        created[0].emit(EVENTS.DISCONNECT);
        await vi.advanceTimersByTimeAsync(30_000);
        created[0].emit(EVENTS.CONNECT);
        await vi.advanceTimersByTimeAsync(300_000);
        expect(created).toHaveLength(1);
        expect(service.isConnected()).toBe(true);
    });

    it('keeps the consumer running when persisting status fails, and retries a bounded number of times', async () => {
        const upsert = vi.fn().mockRejectedValue(new Error('read ECONNRESET'));
        const service = makeService(upsert);
        await service.start();

        created[0].emit(EVENTS.CONNECT);
        await vi.advanceTimersByTimeAsync(60_000);

        expect(service.isConnected()).toBe(true);
        expect(upsert).toHaveBeenCalledTimes(4);
        expect(created).toHaveLength(1);
    });

    it('persists the status on a later attempt after a transient failure', async () => {
        const upsert = vi
            .fn()
            .mockRejectedValueOnce(new Error('read ECONNRESET'))
            .mockResolvedValue(undefined);
        const service = makeService(upsert);
        await service.start();

        created[0].emit(EVENTS.CONNECT);
        await vi.advanceTimersByTimeAsync(6_000);

        expect(upsert).toHaveBeenCalledTimes(2);
        expect(upsert).toHaveBeenLastCalledWith(
            { key: 'default', connected: true },
            { conflictPaths: ['key'] },
        );
    });

    it('does not arm the watchdog while kafkajs restarts itself after a crash, however long it takes', async () => {
        const service = makeService(vi.fn().mockResolvedValue(undefined));
        await service.start();
        created[0].emit(EVENTS.CONNECT);

        created[0].emit(EVENTS.CRASH, { payload: { restart: true } });
        created[0].emit(EVENTS.DISCONNECT);
        await vi.advanceTimersByTimeAsync(600_000);

        expect(created).toHaveLength(1);
    });

    it('disconnects a half-started consumer before the crash retry builds a new one', async () => {
        const service = makeService(vi.fn().mockResolvedValue(undefined));
        runError = new Error('boom');
        await expect(service.start()).rejects.toThrow('boom');
        runError = undefined;

        await vi.advanceTimersByTimeAsync(1_000);

        expect(created).toHaveLength(2);
        expect(created[0].disconnect).toHaveBeenCalled();
        expect(created[1].run).toHaveBeenCalledTimes(1);
    });
});
