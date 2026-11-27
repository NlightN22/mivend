import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    ReplayDryRunIgnoredError,
    ReplayRateLimitedError,
    ResyncReplayClient,
} from '../../resync-replay.client';

const client = new ResyncReplayClient({
    reconciliationApiUrl: 'https://is.example',
    reconciliationApiKey: 'key-1',
    resyncSourceSystem: 'source-a',
} as never);

afterEach(() => vi.unstubAllGlobals());

describe('ResyncReplayClient', () => {
    it('posts the aggregate type, source system and ids with the API key', async () => {
        const fetchMock = vi.fn(
            async () => new Response(JSON.stringify([{ entityId: 'a', status: 'not_found' }])),
        );
        vi.stubGlobal('fetch', fetchMock);
        const result = await client.replay('productPhoto', ['a']);
        expect(result).toEqual([{ entityId: 'a', status: 'not_found' }]);
        const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
        expect(String(url)).toBe('https://is.example/api/resync/v1/replay');
        expect(JSON.parse(String(init.body))).toEqual({
            aggregateType: 'productPhoto',
            sourceSystem: 'source-a',
            entityIds: ['a'],
        });
        expect((init.headers as Record<string, string>)['X-Api-Key']).toBe('key-1');
    });

    it('uses the configured source system', async () => {
        const fetchMock = vi.fn(async () => new Response('[]'));
        vi.stubGlobal('fetch', fetchMock);
        await new ResyncReplayClient({
            reconciliationApiUrl: 'https://is.example',
            resyncSourceSystem: 'source-b',
        } as never).replay('productPhoto', ['a']);
        const init = (fetchMock.mock.calls[0] as unknown as [URL, RequestInit])[1];
        expect(JSON.parse(String(init.body)).sourceSystem).toBe('source-b');
    });

    it('throws naming the missing key when the source system or base URL is not configured', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        await expect(
            new ResyncReplayClient({ reconciliationApiUrl: 'https://is.example' } as never).replay(
                'productPhoto',
                ['a'],
            ),
        ).rejects.toThrow('INTEGRATION_RESYNC_SOURCE_SYSTEM');
        await expect(
            new ResyncReplayClient({ resyncSourceSystem: 'source-a' } as never).replay(
                'productPhoto',
                ['a'],
            ),
        ).rejects.toThrow('INTEGRATION_SERVICE_BASE_URL');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('accepts the live {aggregateType, results} response shape', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(
                async () =>
                    new Response(
                        JSON.stringify({
                            aggregateType: 'productPhoto',
                            results: [{ entityId: 'a', status: 'replayed_from_business_db' }],
                        }),
                    ),
            ),
        );
        expect(await client.replay('productPhoto', ['a'])).toEqual([
            { entityId: 'a', status: 'replayed_from_business_db' },
        ]);
    });

    it('throws on a non-2xx response instead of reporting success', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('', { status: 500 })),
        );
        await expect(client.replay('productPhoto', ['a'])).rejects.toThrow('500');
    });
});

describe('ResyncReplayClient documents and rate limit', () => {
    it('posts a document kind with the dry-run flag and an override key', async () => {
        const fetchMock = vi.fn(
            async () =>
                new Response(
                    JSON.stringify({ results: [{ entityId: 'a', status: 'would_republish' }] }),
                ),
        );
        vi.stubGlobal('fetch', fetchMock);
        const out = await client.replayDocuments('customer-order', ['a'], true, 'heal-key');
        expect(out).toEqual([{ entityId: 'a', status: 'would_republish' }]);
        const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
        expect(String(url)).toBe('https://is.example/api/resync/v1/replay-documents');
        expect(JSON.parse(String(init.body))).toEqual({
            kind: 'customer-order',
            entityIds: ['a'],
            dryRun: true,
        });
        expect((init.headers as Record<string, string>)['X-Api-Key']).toBe('heal-key');
    });

    it('throws a rate-limit error on 429', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('', { status: 429 })),
        );
        await expect(client.replayDocuments('customer-order', ['a'], true)).rejects.toBeInstanceOf(
            ReplayRateLimitedError,
        );
    });
});

describe('ResyncReplayClient generic dry run', () => {
    it('sends dryRun only when asked', async () => {
        const fetchMock = vi.fn(async () => new Response('[]'));
        vi.stubGlobal('fetch', fetchMock);
        await client.replay('productPhoto', ['a'], undefined, true);
        await client.replay('productPhoto', ['a']);
        const bodies = fetchMock.mock.calls.map(c =>
            JSON.parse(String((c as unknown as [URL, RequestInit])[1].body)),
        );
        expect(bodies[0].dryRun).toBe(true);
        expect(bodies[1].dryRun).toBeUndefined();
    });
});

describe('ResyncReplayClient.replayForHeal', () => {
    const answer = (body: unknown): void => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response(JSON.stringify(body))),
        );
    };

    it('maps a dry-run source to would_republish and keeps not_found', async () => {
        answer({
            dryRun: true,
            results: [
                { entityId: 'a', status: 'replayed_from_outbox' },
                { entityId: 'b', status: 'not_found' },
            ],
        });
        expect(await client.replayForHeal('productPhoto', ['a', 'b'], true)).toEqual([
            { entityId: 'a', status: 'would_republish' },
            { entityId: 'b', status: 'not_found' },
        ]);
    });

    it('throws when a dry-run answer does not carry dryRun: true', async () => {
        answer({ results: [{ entityId: 'a', status: 'replayed_from_state' }] });
        await expect(client.replayForHeal('productPhoto', ['a'], true)).rejects.toBeInstanceOf(
            ReplayDryRunIgnoredError,
        );
    });

    it('maps a real run source to republished', async () => {
        answer({
            dryRun: false,
            results: [{ entityId: 'a', status: 'replayed_from_business_db' }],
        });
        expect(await client.replayForHeal('productPhoto', ['a'], false)).toEqual([
            { entityId: 'a', status: 'republished' },
        ]);
    });
});
