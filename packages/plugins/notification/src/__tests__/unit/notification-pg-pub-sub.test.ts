import { EventEmitter } from 'node:events';
import type { Client } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PgPubSub } from '../../notification-pg-pub-sub';

class FakeClient extends EventEmitter {
    queries: string[] = [];
    constructor(private readonly connectError?: Error) {
        super();
    }
    connect = vi.fn(async () => {
        if (!this.connectError) return;
        // pg emits 'end' when a failed connection closes, after connect() has returned its promise
        await Promise.resolve();
        this.emit('end');
        throw this.connectError;
    });
    query = vi.fn(async (sql: string) => {
        this.queries.push(sql);
        return { rows: [] };
    });
    end = vi.fn(async () => {
        this.emit('end');
    });
}

const unhandled = vi.fn();
process.on('unhandledRejection', unhandled);

afterEach(() => {
    vi.useRealTimers();
    unhandled.mockClear();
});

describe('PgPubSub reconnect', () => {
    it('survives a failed reconnect without an unhandled rejection and recovers on the next try', async () => {
        vi.useFakeTimers();
        const first = new FakeClient();
        const failing = new FakeClient(new Error('db is down'));
        const recovered = new FakeClient();
        const clients = [first, failing, recovered];
        const pubSub = new PgPubSub(() => clients.shift() as unknown as Client, 'test_channel');
        const seen: unknown[] = [];
        await pubSub.subscribe('t', p => seen.push(p));

        first.emit('end');
        await vi.advanceTimersByTimeAsync(1000);
        await vi.advanceTimersByTimeAsync(1000);

        recovered.emit('notification', {
            payload: JSON.stringify({ trigger: 't', payload: 'hello' }),
        });
        expect(unhandled).not.toHaveBeenCalled();
        expect(recovered.queries).toContain('LISTEN test_channel');
        expect(seen).toEqual(['hello']);
        await pubSub.onModuleDestroy();
    });

    it('closes the connection and reports the error when LISTEN fails', async () => {
        const broken = new FakeClient();
        broken.query.mockRejectedValue(new Error('LISTEN denied'));
        const pubSub = new PgPubSub(() => broken as unknown as Client, 'test_channel');

        await expect(pubSub.subscribe('t', () => undefined)).rejects.toThrow('LISTEN denied');

        expect(broken.end).toHaveBeenCalled();
        expect(unhandled).not.toHaveBeenCalled();
    });

    it('keeps delivering to the other subscribers when one of them throws', async () => {
        const client = new FakeClient();
        const pubSub = new PgPubSub(() => client as unknown as Client, 'test_channel');
        const seen: unknown[] = [];
        await pubSub.subscribe('t', () => {
            throw new Error('bad subscriber');
        });
        await pubSub.subscribe('t', p => seen.push(p));

        client.emit('notification', { payload: JSON.stringify({ trigger: 't', payload: 1 }) });

        expect(seen).toEqual([1]);
        await pubSub.onModuleDestroy();
    });
});
