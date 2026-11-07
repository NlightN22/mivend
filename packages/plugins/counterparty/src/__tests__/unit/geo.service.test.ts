import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeoService } from '../../geo/geo.service';

const fetchMock = vi.fn();
const okOpen = { ok: true, json: async () => [{ display_name: 'Street 1', lat: '1', lon: '2' }] };

describe('GeoService', () => {
    beforeEach(() => {
        process.env.GEO_PROVIDERS = 'open';
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockReset();
    });
    afterEach(() => {
        for (const k of [
            'GEO_PROVIDERS',
            'GEO_DEFAULT_PROVIDER',
            'GEO_PROVIDER_A_API_KEY',
            'GEO_PROVIDER_A_BROWSER_KEY',
            'GEO_OPEN_BROWSER_KEY',
            'GEO_DEFAULT_ZOOM',
        ])
            delete process.env[k];
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('is off without a provider and for short queries', async () => {
        const off = new GeoService();
        delete process.env.GEO_PROVIDERS;
        expect(await new GeoService().search('Street 1')).toEqual([]);
        expect(await off.search('ab')).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('is off for a keyed provider without a server key and rejects unknown keys', async () => {
        process.env.GEO_PROVIDERS = 'provider-a';
        expect(await new GeoService().search('Street 1')).toEqual([]);
        process.env.GEO_PROVIDERS = 'nope';
        expect(() => new GeoService().publicConfig()).toThrow('Unknown geo provider');
    });

    it('caches repeated searches and reverse lookups', async () => {
        fetchMock.mockResolvedValue(okOpen);
        const service = new GeoService();
        expect(await service.search('Street 1')).toEqual([{ address: 'Street 1', lat: 1, lng: 2 }]);
        await service.search('street 1');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({ display_name: 'Here' }) });
        expect(await service.reverse({ lat: 1, lng: 2 })).toBe('Here');
        await service.reverse({ lat: 1, lng: 2 });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('fails open and pauses calls after a provider error', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 500 });
        const service = new GeoService();
        expect(await service.search('Street 1')).toEqual([]);
        expect(await service.search('Street 2')).toEqual([]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('spaces calls by the provider interval and drops when the queue is too long', async () => {
        vi.useFakeTimers();
        fetchMock.mockResolvedValue(okOpen);
        const service = new GeoService();
        const calls = ['aaa', 'bbb', 'ccc', 'ddd', 'eee', 'fff'].map(q => service.search(q));
        await vi.advanceTimersByTimeAsync(10_000);
        const results = await Promise.all(calls);
        expect(results.filter(r => r.length > 0)).toHaveLength(3);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('rejects a provider that is not enabled', async () => {
        const service = new GeoService();
        await expect(service.search('Street 1', undefined, 'provider-a')).rejects.toThrow(
            'not enabled',
        );
        await expect(service.reverse({ lat: 1, lng: 2 }, 'provider-b')).rejects.toThrow(
            'not enabled',
        );
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('keeps cache and failure pause separate per provider', async () => {
        process.env.GEO_PROVIDERS = 'open,provider-a';
        process.env.GEO_PROVIDER_A_API_KEY = 'k';
        const service = new GeoService();
        fetchMock.mockResolvedValue({ ok: false, status: 500 });
        expect(await service.search('Street 1')).toEqual([]);
        expect(await service.search('Street 2')).toEqual([]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({
                response: {
                    GeoObjectCollection: {
                        featureMember: [
                            {
                                GeoObject: {
                                    metaDataProperty: { GeocoderMetaData: { text: 'A 1' } },
                                    Point: { pos: '2 1' },
                                },
                            },
                        ],
                    },
                },
            }),
        });
        expect(await service.search('Street 1', undefined, 'provider-a')).toHaveLength(1);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        await service.search('Street 1', undefined, 'provider-a');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('exposes enabled providers with public keys only and the default', () => {
        process.env.GEO_PROVIDERS = 'open,provider-a,provider-b';
        process.env.GEO_PROVIDER_A_API_KEY = 'server-secret';
        process.env.GEO_PROVIDER_A_BROWSER_KEY = 'browser-key';
        process.env.GEO_DEFAULT_PROVIDER = 'provider-a';
        process.env.GEO_DEFAULT_ZOOM = '9';
        const config = new GeoService().publicConfig();
        expect(JSON.stringify(config)).not.toContain('server-secret');
        expect(config).toMatchObject({
            providers: [
                { key: 'open', publicKey: null },
                { key: 'provider-a', publicKey: 'browser-key' },
            ],
            defaultProvider: 'provider-a',
            defaultZoom: 9,
        });
    });

    it('falls back to the first enabled provider when the default is not enabled', () => {
        process.env.GEO_DEFAULT_PROVIDER = 'provider-b';
        expect(new GeoService().publicConfig().defaultProvider).toBe('open');
    });
});
