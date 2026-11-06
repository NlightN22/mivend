import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SearchServiceClient } from '../../search-service.client';

// Issue #69, external-boundary contract test: mock the HTTP call to search-service, never hit a
// real network in automated tests (external-integration-rules skill).
describe('SearchServiceClient.resolveQuery', () => {
    const ORIGINAL_URL = process.env.SEARCH_SERVICE_URL;
    const ORIGINAL_KEY = process.env.SEARCH_SERVICE_API_KEY;

    beforeEach(() => {
        process.env.SEARCH_SERVICE_URL = 'http://search-service.test';
        process.env.SEARCH_SERVICE_API_KEY = 'test-key';
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        process.env.SEARCH_SERVICE_URL = ORIGINAL_URL;
        process.env.SEARCH_SERVICE_API_KEY = ORIGINAL_KEY;
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
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({ 'X-Api-Key': 'test-key' }),
            }),
        );
    });

    it('throws when SEARCH_SERVICE_API_KEY is not set, without calling fetch', async () => {
        delete process.env.SEARCH_SERVICE_API_KEY;
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const client = new SearchServiceClient();
        await expect(client.resolveQuery({ query: 'x' })).rejects.toThrow(/SEARCH_SERVICE_API_KEY/);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('surfaces a rejected API key (401) as an error with its status', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'invalid key' }),
        );
        const client = new SearchServiceClient();
        await expect(client.resolveQuery({ query: 'x' })).rejects.toThrow(/401/);
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

describe('SearchServiceClient end-user id and limit errors', () => {
    const headers = (h: Record<string, string> = {}): Headers => new Headers(h);
    const failing = (status: number, body: unknown, h: Record<string, string> = {}) => ({
        ok: false,
        status,
        headers: headers(h),
        text: async () => JSON.stringify(body),
    });

    beforeEach(() => {
        process.env.SEARCH_SERVICE_URL = 'http://search-service.test';
        process.env.SEARCH_SERVICE_API_KEY = 'test-key';
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('sends X-End-User-Id only when given', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ items: [], total: 0 }),
        });
        vi.stubGlobal('fetch', fetchMock);
        const client = new SearchServiceClient();
        await client.resolveQuery({ query: 'a' }, 'abc123');
        await client.resolveQuery({ query: 'a' });
        expect(fetchMock.mock.calls[0][1].headers['X-End-User-Id']).toBe('abc123');
        expect(fetchMock.mock.calls[1][1].headers).not.toHaveProperty('X-End-User-Id');
    });

    it('retries a 429 once after a short Retry-After and then succeeds', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(failing(429, {}, { 'Retry-After': '1' }))
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ items: [], total: 0 }),
            });
        vi.stubGlobal('fetch', fetchMock);
        const promise = new SearchServiceClient().resolveQuery({ query: 'a' });
        await vi.advanceTimersByTimeAsync(1000);
        await expect(promise).resolves.toEqual({ items: [], total: 0 });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not loop: a second 429 becomes a rate-limited error', async () => {
        const fetchMock = vi.fn().mockResolvedValue(failing(429, {}, { 'Retry-After': '2' }));
        vi.stubGlobal('fetch', fetchMock);
        const promise = new SearchServiceClient().resolveQuery({ query: 'a' });
        const assertion = expect(promise).rejects.toMatchObject({
            extensions: { code: 'SEARCH_RATE_LIMITED', retryAfterSeconds: 2 },
        });
        await vi.advanceTimersByTimeAsync(2000);
        await assertion;
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('uses a default wait without Retry-After', async () => {
        const fetchMock = vi.fn().mockResolvedValue(failing(429, {}));
        vi.stubGlobal('fetch', fetchMock);
        const promise = new SearchServiceClient().resolveQuery({ query: 'a' });
        const assertion = expect(promise).rejects.toMatchObject({
            extensions: { retryAfterSeconds: 1 },
        });
        await vi.advanceTimersByTimeAsync(1000);
        await assertion;
    });

    it('does not wait when Retry-After is above the backoff cap', async () => {
        const fetchMock = vi.fn().mockResolvedValue(failing(429, {}, { 'Retry-After': '30' }));
        vi.stubGlobal('fetch', fetchMock);
        await expect(new SearchServiceClient().resolveQuery({ query: 'a' })).rejects.toMatchObject({
            extensions: { code: 'SEARCH_RATE_LIMITED', retryAfterSeconds: 30 },
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('maps 403 END_USER_BLOCKED without retry', async () => {
        const fetchMock = vi.fn().mockResolvedValue(failing(403, { code: 'END_USER_BLOCKED' }));
        vi.stubGlobal('fetch', fetchMock);
        await expect(new SearchServiceClient().resolveQuery({ query: 'a' })).rejects.toMatchObject({
            extensions: { code: 'SEARCH_END_USER_BLOCKED' },
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('maps 400 OFFSET_TOO_LARGE', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(failing(400, { code: 'OFFSET_TOO_LARGE' })),
        );
        await expect(new SearchServiceClient().resolveQuery({ query: 'a' })).rejects.toMatchObject({
            extensions: { code: 'SEARCH_REFINE_QUERY' },
        });
    });
});
