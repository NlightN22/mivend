import { Client } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { testDataSourceConnectionOptions } from 'shared';

import { PgPubSub } from '../../notification-pg-pub-sub';

const channel = `notif_test_${process.pid}`;
const instances: PgPubSub[] = [];

function newProcess(): PgPubSub {
    const o = testDataSourceConnectionOptions();
    const pubSub = new PgPubSub(
        () =>
            new Client({
                host: o.host,
                port: o.port,
                user: o.username,
                password: o.password,
                database: o.database,
            }),
        channel,
    );
    instances.push(pubSub);
    return pubSub;
}

// Resolves once the LISTEN is active, handing back a getter for the next message (a returned promise would be awaited here).
async function nextMessage(pubSub: PgPubSub, trigger: string): Promise<() => Promise<unknown>> {
    let resolveMessage!: (payload: unknown) => void;
    const message = new Promise<unknown>(resolve => (resolveMessage = resolve));
    await pubSub.subscribe(trigger, resolveMessage);
    return () => message;
}

afterEach(async () => {
    await Promise.all(instances.splice(0).map(p => p.onModuleDestroy()));
});

describe('PgPubSub (real Postgres, two processes)', () => {
    it('delivers a message published in one process to a subscriber in another', async () => {
        const shopServer = newProcess();
        const adminServer = newProcess();
        const received = await nextMessage(adminServer, 'received');

        await shopServer.publish('received', {
            notificationReceived: { id: '1', title: 'New order' },
        });

        expect(await received()).toEqual({ notificationReceived: { id: '1', title: 'New order' } });
    });

    it('delivers only to subscribers of the same trigger and stops after unsubscribe', async () => {
        const a = newProcess();
        const b = newProcess();
        const seen: unknown[] = [];
        const id = await b.subscribe('t1', p => seen.push(p));
        await b.subscribe('t2', p => seen.push(['wrong', p]));
        const witness = await nextMessage(b, 't1');

        await a.publish('t1', 'first');
        await witness();
        b.unsubscribe(id);
        const next = await nextMessage(b, 't1');
        await a.publish('t1', 'second');
        await next();

        expect(seen).toEqual(['first']);
    });

    it('restores timestamp columns to Date objects', async () => {
        const a = newProcess();
        const b = newProcess();
        const received = await nextMessage(b, 'received');
        const iso = '2026-11-07T10:00:00.000Z';

        await a.publish('received', { createdAt: new Date(iso), title: iso });

        expect(await received()).toEqual({ createdAt: new Date(iso), title: iso });
    });

    it('carries a realistic Cyrillic notification of a couple of thousand characters', async () => {
        const a = newProcess();
        const b = newProcess();
        const received = await nextMessage(b, 'received');
        const notificationReceived = { id: '1', title: 'Заказ', message: 'ж'.repeat(2500) };

        await a.publish('received', { notificationReceived });

        expect(await received()).toEqual({ notificationReceived });
    });

    it('resumes after the listener connection is killed, and delivers each message once', async () => {
        const a = newProcess();
        const b = newProcess();
        const seen: unknown[] = [];
        await b.subscribe('received', p => seen.push(p));
        const o = testDataSourceConnectionOptions();
        const killer = new Client({
            host: o.host,
            port: o.port,
            user: o.username,
            password: o.password,
            database: o.database,
        });
        await killer.connect();
        try {
            await killer.query(
                `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE query = $1 AND pid <> pg_backend_pid()`,
                [`LISTEN ${channel}`],
            );
        } finally {
            await killer.end();
        }

        await vi.waitFor(
            async () => {
                await a.publish('received', 'after-reconnect');
                expect(seen).toContain('after-reconnect');
            },
            { timeout: 10_000, interval: 500 },
        );
        const before = seen.filter(p => p === 'after-reconnect').length;
        await a.publish('received', 'final');
        await vi.waitFor(() => expect(seen).toContain('final'));

        expect(seen.filter(p => p === 'final')).toHaveLength(1);
        expect(before).toBeGreaterThanOrEqual(1);
    });

    it('fails loudly when the payload is over the NOTIFY limit', async () => {
        await expect(newProcess().publish('received', 'x'.repeat(8000))).rejects.toThrow(
            /size limit/,
        );
    });
});
