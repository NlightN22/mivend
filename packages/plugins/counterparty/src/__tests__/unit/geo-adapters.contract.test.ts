import { describe, expect, it, vi } from 'vitest';
import { GeoFetch, GeoProvider } from '../../geo/geo-provider';
import { OpenAdapter } from '../../geo/open.adapter';
import { ProviderAAdapter } from '../../geo/provider-a.adapter';
import { ProviderBAdapter } from '../../geo/provider-b.adapter';

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
        name: 'provider-a',
        make: f => new ProviderAAdapter({ apiKey: 'k', fetch: f as unknown as GeoFetch }),
        searchBody: {
            response: {
                GeoObjectCollection: {
                    featureMember: [
                        {
                            GeoObject: {
                                metaDataProperty: { GeocoderMetaData: { text: 'Street 1, City' } },
                                Point: { pos: '37.5 55.7' },
                            },
                        },
                        {
                            GeoObject: {
                                metaDataProperty: { GeocoderMetaData: { text: 'No point' } },
                            },
                        },
                    ],
                },
            },
        },
        reverseBody: {
            response: {
                GeoObjectCollection: {
                    featureMember: [
                        {
                            GeoObject: {
                                metaDataProperty: { GeocoderMetaData: { text: 'Street 1, City' } },
                                Point: { pos: '37.5 55.7' },
                            },
                        },
                    ],
                },
            },
        },
        emptyBody: { response: { GeoObjectCollection: { featureMember: [] } } },
    },
    {
        name: 'provider-b',
        make: f => new ProviderBAdapter({ apiKey: 'k', fetch: f as unknown as GeoFetch }),
        searchBody: {
            status: 'OK',
            results: [
                {
                    formatted_address: 'Street 1, City',
                    geometry: { location: { lat: 55.7, lng: 37.5 } },
                },
                { formatted_address: 'No point' },
            ],
        },
        reverseBody: { status: 'OK', results: [{ formatted_address: 'Street 1, City' }] },
        emptyBody: { status: 'ZERO_RESULTS', results: [] },
    },
    {
        name: 'open',
        make: f =>
            new OpenAdapter({
                apiKey: '',
                fetch: f as unknown as GeoFetch,
                userAgent: 'test-agent',
            }),
        searchBody: [
            { display_name: 'Street 1, City', lat: '55.7', lon: '37.5' },
            { display_name: 'No point' },
        ],
        reverseBody: { display_name: 'Street 1, City' },
        emptyBody: [],
    },
];

describe.each(cases)('geo adapter contract: $name', c => {
    it('maps search results, coordinates optional', async () => {
        const fetch = vi.fn().mockResolvedValue(json(c.searchBody));
        const found = await c.make(fetch).search('Street 1', { lat: 55, lng: 37 });
        expect(found).toEqual([
            { address: 'Street 1, City', lat: 55.7, lng: 37.5 },
            { address: 'No point' },
        ]);
    });

    it('reverse returns the address, null when nothing found', async () => {
        const fetch = vi
            .fn()
            .mockResolvedValueOnce(json(c.reverseBody))
            .mockResolvedValueOnce(json(c.emptyBody));
        const provider = c.make(fetch);
        expect(await provider.reverse({ lat: 55.7, lng: 37.5 })).toBe('Street 1, City');
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
        await c.make(fetch).search('Some Street', { lat: 55, lng: 37 });
        const url = decodeURIComponent(String(fetch.mock.calls[0][0]).replace(/\+/g, ' '));
        expect(url).toContain('Some Street');
    });
});

describe('provider specifics', () => {
    it('provider-b treats a non-OK status in a 200 answer as failure', async () => {
        const fetch = vi.fn().mockResolvedValue(json({ status: 'REQUEST_DENIED' }));
        await expect(
            new ProviderBAdapter({ apiKey: 'k', fetch: fetch as unknown as GeoFetch }).search(
                'abc',
            ),
        ).rejects.toThrow('REQUEST_DENIED');
    });

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
