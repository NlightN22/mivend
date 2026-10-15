import { describe, it, expect, beforeEach, vi } from 'vitest';
import { adminApi, ApiNetworkError } from '../../api/client';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
    return {
        ok,
        status,
        json: async () => body,
    } as Response;
}

describe('adminApi', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    it('returns data on a successful response without retrying', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { ok: true } }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await adminApi<{ ok: boolean }>('{ ok }');

        expect(result).toEqual({ ok: true });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not retry a real HTTP error response — only genuine network failures', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));
        vi.stubGlobal('fetch', fetchMock);

        await expect(adminApi('{ ok }')).rejects.toThrow('Admin API error: 500');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('retries a genuine network failure and eventually throws ApiNetworkError', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
        vi.stubGlobal('fetch', fetchMock);

        const promise = adminApi('{ ok }');
        // Must attach the rejection handler before advancing fake timers;
        // otherwise the rejection is unhandled during the gap and triggers a warning.
        await Promise.all([
            expect(promise).rejects.toBeInstanceOf(ApiNetworkError),
            vi.runAllTimersAsync(),
        ]);
        // Initial attempt + 3 retries.
        expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('succeeds if a retry recovers after an initial network failure', async () => {
        const fetchMock = vi
            .fn()
            .mockRejectedValueOnce(new TypeError('Failed to fetch'))
            .mockResolvedValueOnce(jsonResponse({ data: { ok: true } }));
        vi.stubGlobal('fetch', fetchMock);

        const promise = adminApi<{ ok: boolean }>('{ ok }');
        await Promise.all([expect(promise).resolves.toEqual({ ok: true }), vi.runAllTimersAsync()]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    // Simulates a hung fetch that never settles: browser TCP timeouts can take tens of seconds,
    // so this asserts our own 5s timeout aborts and retries instead.
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

        const promise = adminApi('{ ok }');
        await Promise.all([
            expect(promise).rejects.toBeInstanceOf(ApiNetworkError),
            vi.runAllTimersAsync(),
        ]);
        // Initial attempt + 3 retries, each one aborted by the 5s timeout rather than hanging.
        expect(fetchMock).toHaveBeenCalledTimes(4);
    });
});
