import { afterEach, describe, expect, it, vi } from 'vitest';

import { ResyncReplayClient } from '../../resync-replay.client';

const client = new ResyncReplayClient({
    reconciliationApiUrl: 'https://is.example',
    reconciliationApiKey: 'key-1',
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
            sourceSystem: 'onec-main',
            entityIds: ['a'],
        });
        expect((init.headers as Record<string, string>)['X-Api-Key']).toBe('key-1');
    });

    it('throws on a non-2xx response instead of reporting success', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('', { status: 500 })),
        );
        await expect(client.replay('productPhoto', ['a'])).rejects.toThrow('500');
    });
});
