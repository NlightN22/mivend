import { afterEach, describe, expect, it, Mock, vi } from 'vitest';

import { ExchangeHealthClient } from '../../exchange-health.client';
import { ExchangeHealthReadError } from '../../exchange-health';

const OPS_KEY = 'ops-key-secret';
const client = new ExchangeHealthClient({
    reconciliationApiUrl: 'https://is.example',
    integrationOpsApiKey: OPS_KEY,
} as never);

const channel = (extra: object = {}): Record<string, unknown> => ({
    status: 'OK',
    lastActivityAt: '2026-11-20T10:00:00Z',
    streams: [
        {
            stream: 'price',
            entityType: 'price',
            status: 'OK',
            lastActivityAt: null,
            pending: 2,
            oldestPendingAgeSeconds: 30,
            failedLast24h: 1,
        },
    ],
    ...extra,
});

interface Body {
    channels: Record<string, unknown>;
    [key: string]: unknown;
}

const body = (overrides: object = {}): Body => ({
    generatedAt: '2026-11-20T10:00:05Z',
    status: 'DEGRADED',
    thresholds: { pullDownSeconds: 900 },
    channels: {
        ingest: channel(),
        pull: channel({ streams: [] }),
        ack: channel({
            status: 'DEGRADED',
            streams: [
                {
                    stream: 'order',
                    entityType: 'order',
                    status: 'DEGRADED',
                    lastActivityAt: null,
                    deliveredUnacknowledged: 3,
                    oldestDeliveredAgeSeconds: 600,
                    rejectedLast24h: 4,
                },
            ],
        }),
    },
    failures24h: {
        status: 'DEGRADED',
        inboxFailedLast24h: 1,
        outboxFailedLast24h: 0,
        outboundRejectedLast24h: 4,
    },
    resyncSignals: {
        pending: 1,
        delivered: 0,
        acknowledgedLast24h: 2,
        rejectedLast24h: 0,
        open: [
            {
                id: 's-1',
                stream: 'price',
                dryRun: false,
                status: 'pending',
                createdAt: '2026-11-20T09:00:00Z',
            },
        ],
    },
    ...overrides,
});

const respond = (status: number, payload: unknown): Mock<() => Promise<Response>> =>
    vi.fn(
        async () =>
            new Response(typeof payload === 'string' ? payload : JSON.stringify(payload), {
                status,
            }),
    );

afterEach(() => vi.unstubAllGlobals());

async function reasonOf(call: Promise<unknown>): Promise<string> {
    const err = await call.then(
        () => null,
        (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ExchangeHealthReadError);
    return (err as ExchangeHealthReadError).reason;
}

describe('ExchangeHealthClient', () => {
    it('reads the health with the ops key header and maps the three channels', async () => {
        const fetchMock = respond(200, body());
        vi.stubGlobal('fetch', fetchMock);
        const health = await client.fetchHealth();
        const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
        expect(String(url)).toBe('https://is.example/api/ops/v1/exchange-health');
        expect((init.headers as Record<string, string>)['X-Api-Key']).toBe(OPS_KEY);
        expect(health.status).toBe('DEGRADED');
        expect(health.channels.map(c => c.channel)).toEqual(['ingest', 'pull', 'ack']);
        expect(health.channels[2].streams[0]).toMatchObject({
            pending: 3,
            oldestAgeSeconds: 600,
            failedLast24h: 4,
        });
        expect(health.failures.outboundRejectedLast24h).toBe(4);
        expect(health.resync.open[0].id).toBe('s-1');
    });

    it('ignores unknown fields the service adds', async () => {
        vi.stubGlobal(
            'fetch',
            respond(200, {
                ...body(),
                futureField: { a: 1 },
                channels: { ...body().channels, extra: {} },
            }),
        );
        await expect(client.fetchHealth()).resolves.toMatchObject({ status: 'DEGRADED' });
    });

    it.each([401, 403])('maps %i to UNAUTHORIZED', async code => {
        vi.stubGlobal('fetch', respond(code, 'no'));
        expect(await reasonOf(client.fetchHealth())).toBe('UNAUTHORIZED');
    });

    it('maps another non-2xx to SERVER_ERROR', async () => {
        vi.stubGlobal('fetch', respond(503, 'down'));
        expect(await reasonOf(client.fetchHealth())).toBe('SERVER_ERROR');
    });

    it('maps a network failure to UNREACHABLE and never puts the key into the message', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
                throw new TypeError(`fetch failed ${OPS_KEY}`);
            }),
        );
        const err = await client.fetchHealth().catch((e: Error) => e);
        expect((err as ExchangeHealthReadError).reason).toBe('UNREACHABLE');
        expect((err as Error).message).not.toContain(OPS_KEY);
    });

    it('refuses redirects so the key is never forwarded', async () => {
        const fetchMock = respond(200, body());
        vi.stubGlobal('fetch', fetchMock);
        await client.fetchHealth();
        expect((fetchMock.mock.calls[0] as unknown as [URL, RequestInit])[1].redirect).toBe(
            'error',
        );
    });

    it('times out a body that never arrives', async () => {
        vi.useFakeTimers();
        vi.stubGlobal(
            'fetch',
            vi.fn(
                async (_url: unknown, init: RequestInit) =>
                    ({
                        ok: true,
                        status: 200,
                        json: () =>
                            new Promise((_res, rej) =>
                                init.signal?.addEventListener('abort', () =>
                                    rej(new DOMException('aborted', 'AbortError')),
                                ),
                            ),
                    }) as unknown as Response,
            ),
        );
        const pending = reasonOf(client.fetchHealth());
        await vi.advanceTimersByTimeAsync(10_001);
        expect(await pending).toBe('TIMEOUT');
        vi.useRealTimers();
    });

    it('maps an aborted request to TIMEOUT', async () => {
        vi.useFakeTimers();
        vi.stubGlobal(
            'fetch',
            vi.fn(
                (_url: unknown, init: RequestInit) =>
                    new Promise((_res, rej) => {
                        init.signal?.addEventListener('abort', () =>
                            rej(new DOMException('aborted', 'AbortError')),
                        );
                    }),
            ),
        );
        const pending = reasonOf(client.fetchHealth());
        await vi.advanceTimersByTimeAsync(10_001);
        expect(await pending).toBe('TIMEOUT');
        vi.useRealTimers();
    });

    it.each([
        ['not JSON', '<html>'],
        ['a body without channels', { status: 'OK', generatedAt: 'x' }],
        ['an invalid overall status', body({ status: 'GREEN' })],
        [
            'a channel without streams',
            body({ channels: { ingest: { status: 'OK' }, pull: channel(), ack: channel() } }),
        ],
    ])('maps %s to BAD_RESPONSE, never OK', async (_name, payload) => {
        vi.stubGlobal('fetch', respond(200, payload));
        expect(await reasonOf(client.fetchHealth())).toBe('BAD_RESPONSE');
    });

    it('is NOT_CONFIGURED without the ops key or the base URL and does not call out', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        for (const options of [
            { reconciliationApiUrl: 'https://is.example', integrationOpsApiKey: '' },
            { integrationOpsApiKey: 'k' },
        ]) {
            expect(await reasonOf(new ExchangeHealthClient(options as never).fetchHealth())).toBe(
                'NOT_CONFIGURED',
            );
        }
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
