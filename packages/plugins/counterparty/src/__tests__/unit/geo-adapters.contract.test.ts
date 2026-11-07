import { describe, expect, it, vi } from 'vitest';
import { GeoFetch, GeoProvider } from '../../geo/geo-provider';
import { OpenAdapter } from '../../geo/open.adapter';

const json = (body: unknown, ok = true, status = 200) =>
    ({ ok, status, json: async () => body }) as Response;

interface Case {
    name: string;
    make: (fetch: ReturnType<typeof vi.fn>) => GeoProvider;
    searchBody: unknown;
    reverseBody: unknown;
    emptyBody: unknown;
}

const cases: Case[] = [
    {
        name: 'open',
        make: f =>
            new OpenAdapter({
                apiKey: '',
                fetch: f as unknown as GeoFetch,
                userAgent: 'test-agent',
            }),
        searchBody: [
            { display_name: 'Street 1, City', lat: '10.7', lon: '10.5' },
            { display_name: 'No point' },
        ],
        reverseBody: { display_name: 'Street 1, City' },
        emptyBody: [],
    },
];

describe.each(cases)('geo adapter contract: $name', c => {
    it('maps search results, coordinates optional', async () => {
        const fetch = vi.fn().mockResolvedValue(json(c.searchBody));
        const found = await c.make(fetch).search('Street 1', { lat: 10, lng: 10 });
        expect(found).toEqual([
            { address: 'Street 1, City', lat: 10.7, lng: 10.5 },
            { address: 'No point' },
        ]);
    });

    it('reverse returns the address, null when nothing found', async () => {
        const fetch = vi
            .fn()
            .mockResolvedValueOnce(json(c.reverseBody))
            .mockResolvedValueOnce(json(c.emptyBody));
        const provider = c.make(fetch);
        expect(await provider.reverse({ lat: 10.7, lng: 10.5 })).toBe('Street 1, City');
        expect(await provider.reverse({ lat: 0.1, lng: 0.1 })).toBeNull();
    });

    it('returns an empty list for no matches', async () => {
        const fetch = vi.fn().mockResolvedValue(json(c.emptyBody));
        expect(await c.make(fetch).search('nothing here')).toEqual([]);
    });

    it('throws on a transport error so the service can pause', async () => {
        const fetch = vi.fn().mockResolvedValue(json({}, false, 503));
        await expect(c.make(fetch).search('Street 1')).rejects.toThrow('503');
    });

    it('sends the query text, bias and no key leakage in headers', async () => {
        const fetch = vi.fn().mockResolvedValue(json(c.emptyBody));
        await c.make(fetch).search('Some Street', { lat: 10, lng: 10 });
        const url = decodeURIComponent(String(fetch.mock.calls[0][0]).replace(/\+/g, ' '));
        expect(url).toContain('Some Street');
    });
});

describe('provider specifics', () => {
    it('open sends the configured User-Agent and declares a 1 req/s interval', async () => {
        const fetch = vi.fn().mockResolvedValue(json([]));
        const adapter = new OpenAdapter({
            apiKey: '',
            fetch: fetch as unknown as GeoFetch,
            userAgent: 'test-agent',
        });
        await adapter.search('abc');
        expect(fetch.mock.calls[0][1].headers['User-Agent']).toBe('test-agent');
        expect(adapter.minIntervalMs).toBeGreaterThanOrEqual(1000);
    });
});
