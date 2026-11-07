import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeoService } from '../../geo/geo.service';

const fetchMock = vi.fn();
const okOpen = { ok: true, json: async () => [{ display_name: 'Street 1', lat: '1', lon: '2' }] };

describe('GeoService', () => {
    beforeEach(() => {
        process.env.GEO_PROVIDER = 'open';
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockReset();
    });
    afterEach(() => {
        for (const k of [
            'GEO_PROVIDER',
            'GEO_PROVIDER_API_KEY',
            'GEO_PUBLIC_BROWSER_KEY',
            'GEO_DEFAULT_ZOOM',
        ])
            delete process.env[k];
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('is off without a provider and for short queries', async () => {
        const off = new GeoService();
        delete process.env.GEO_PROVIDER;
        expect(await new GeoService().search('Street 1')).toEqual([]);
        expect(await off.search('ab')).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('is off for a keyed provider without a server key and rejects unknown keys', async () => {
        process.env.GEO_PROVIDER = 'provider-a';
        expect(await new GeoService().search('Street 1')).toEqual([]);
        process.env.GEO_PROVIDER = 'nope';
        await expect(new GeoService().search('Street 1')).rejects.toThrow('Unknown GEO_PROVIDER');
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

    it('exposes only the public browser key and defaults', () => {
        process.env.GEO_PROVIDER_API_KEY = 'server-secret';
        process.env.GEO_PUBLIC_BROWSER_KEY = 'browser-key';
        process.env.GEO_DEFAULT_ZOOM = '9';
        const config = new GeoService().publicConfig();
        expect(JSON.stringify(config)).not.toContain('server-secret');
        expect(config).toMatchObject({
            provider: 'open',
            publicKey: 'browser-key',
            defaultZoom: 9,
        });
    });
});
