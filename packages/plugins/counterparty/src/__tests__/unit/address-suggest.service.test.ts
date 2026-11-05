import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressSuggestService } from '../../address-suggest.service';

const okBody = { suggestions: [{ unrestricted_value: '655250, Street 1' }] };

describe('AddressSuggestService', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        process.env.ADDRESS_SUGGEST_URL = 'https://suggest.example.com';
        process.env.ADDRESS_SUGGEST_API_KEY = 'key';
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockReset();
    });
    afterEach(() => {
        delete process.env.ADDRESS_SUGGEST_URL;
        delete process.env.ADDRESS_SUGGEST_API_KEY;
        vi.unstubAllGlobals();
    });

    it('returns provider values and caches repeated queries', async () => {
        fetchMock.mockResolvedValue({ ok: true, json: async () => okBody });
        const service = new AddressSuggestService();
        expect(await service.suggest('Street 1')).toEqual(['655250, Street 1']);
        await service.suggest('street 1');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('is off without configuration and for short queries', async () => {
        const service = new AddressSuggestService();
        expect(await service.suggest('ab')).toEqual([]);
        delete process.env.ADDRESS_SUGGEST_API_KEY;
        expect(await service.suggest('Street 1')).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('fails open and pauses calls after a provider error', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 403 });
        const service = new AddressSuggestService();
        expect(await service.suggest('Street 1')).toEqual([]);
        expect(await service.suggest('Street 2')).toEqual([]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
