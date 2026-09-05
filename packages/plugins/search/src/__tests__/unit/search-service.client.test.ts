import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SearchServiceClient } from '../../search-service.client';

// Issue #69, external-boundary contract test: mock the HTTP call to search-service, never hit a
// real network in automated tests (external-integration-rules skill).
describe('SearchServiceClient.resolveQuery', () => {
    const ORIGINAL_URL = process.env.SEARCH_SERVICE_URL;

    beforeEach(() => {
        process.env.SEARCH_SERVICE_URL = 'http://search-service.test';
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        process.env.SEARCH_SERVICE_URL = ORIGINAL_URL;
    });

    it('posts to /resolve-query and returns the parsed response', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ items: [], total: 0 }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const client = new SearchServiceClient();
        const result = await client.resolveQuery({ query: 'oil filter' });

        expect(result).toEqual({ items: [], total: 0 });
        expect(fetchMock).toHaveBeenCalledWith(
            'http://search-service.test/resolve-query',
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('throws (does not swallow) a non-ok response', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' }),
        );
        const client = new SearchServiceClient();
        await expect(client.resolveQuery({ query: 'x' })).rejects.toThrow(/500/);
    });

    it('throws when SEARCH_SERVICE_URL is not set, without calling fetch', async () => {
        delete process.env.SEARCH_SERVICE_URL;
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const client = new SearchServiceClient();
        await expect(client.resolveQuery({ query: 'x' })).rejects.toThrow(/SEARCH_SERVICE_URL/);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('aborts and throws a generic error when the request hangs (audit finding, mivend.audit.70)', async () => {
        vi.useFakeTimers();
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation((_url, init: RequestInit) => {
                return new Promise((_resolve, reject) => {
                    init.signal?.addEventListener('abort', () => {
                        const err = new Error('aborted');
                        err.name = 'AbortError';
                        reject(err);
                    });
                });
            }),
        );
        const client = new SearchServiceClient();
        const pending = expect(client.resolveQuery({ query: 'x' })).rejects.toThrow(/unavailable/);
        await vi.advanceTimersByTimeAsync(5000);
        await pending;
        vi.useRealTimers();
    });

    it('never leaks the raw error response body to the caller (audit finding, mivend.audit.70)', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
                status: 500,
                text: async () => 'internal stack trace or secret detail',
            }),
        );
        const client = new SearchServiceClient();
        await expect(client.resolveQuery({ query: 'x' })).rejects.not.toThrow(
            /internal stack trace or secret detail/,
        );
    });

    it('empty search-service result is not an error', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [], total: 0 }) }),
        );
        const client = new SearchServiceClient();
        await expect(client.resolveQuery({ query: 'no-match-xyz' })).resolves.toEqual({
            items: [],
            total: 0,
        });
    });
});
