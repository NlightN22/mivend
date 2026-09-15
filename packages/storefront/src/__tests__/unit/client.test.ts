import { describe, it, expect, beforeEach, vi } from 'vitest';
import { shopApi, ApiNetworkError } from '../../api/client';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
    return {
        ok,
        status,
        headers: { get: () => null },
        json: async () => body,
    } as unknown as Response;
}

// Mirrors packages/manager/src/__tests__/unit/client.test.ts — both clients share the exact
// same fetchWithRetry shape (issue #115).
describe('shopApi', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    it('returns data on a successful response without retrying', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { ok: true } }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await shopApi<{ ok: boolean }>('{ ok }');

        expect(result).toEqual({ ok: true });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not retry a real HTTP error response — only genuine network failures', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));
        vi.stubGlobal('fetch', fetchMock);

        await expect(shopApi('{ ok }')).rejects.toThrow('Shop API error: 500');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('retries a genuine network failure and eventually throws ApiNetworkError', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
        vi.stubGlobal('fetch', fetchMock);

        const promise = shopApi('{ ok }');
        await Promise.all([
            expect(promise).rejects.toBeInstanceOf(ApiNetworkError),
            vi.runAllTimersAsync(),
        ]);
        expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    // Issue #115's own live remote-network finding: a hung connection with no response (not a
    // thrown error) used to rely on the browser's own default TCP timeout, which can run into
    // the tens of seconds. Simulates that by never resolving/rejecting fetch() and asserting the
    // request aborts (and retries) on our own 5s timeout instead of hanging indefinitely.
    it('aborts and retries a request that hangs with no response, instead of waiting forever', async () => {
        const fetchMock = vi.fn().mockImplementation(
            (_url: string, init?: RequestInit) =>
                new Promise((_resolve, reject) => {
                    init?.signal?.addEventListener('abort', () => {
                        reject(new DOMException('The operation was aborted.', 'AbortError'));
                    });
                }),
        );
        vi.stubGlobal('fetch', fetchMock);

        const promise = shopApi('{ ok }');
        await Promise.all([
            expect(promise).rejects.toBeInstanceOf(ApiNetworkError),
            vi.runAllTimersAsync(),
        ]);
        expect(fetchMock).toHaveBeenCalledTimes(4);
    });
});
