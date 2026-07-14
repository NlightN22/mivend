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
        // Attach the assertion before advancing fake timers, so the rejection is always
        // "handled" from the consumer's perspective — avoids a spurious unhandled-rejection
        // warning from the gap between the promise rejecting and being awaited.
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
});
