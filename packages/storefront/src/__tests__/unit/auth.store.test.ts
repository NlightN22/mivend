import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { ApiNetworkError } from '../../api/client';

const sessionStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
            store[key] = value;
        },
        removeItem: (key: string) => {
            delete store[key];
        },
        clear: () => {
            store = {};
        },
    };
})();
vi.stubGlobal('sessionStorage', sessionStorageMock);

const shopApiMock = vi.fn();
vi.mock('../../api/client', async () => {
    const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
    return { ...actual, shopApi: (...args: unknown[]) => shopApiMock(...args) };
});

describe('useAuthStore (storefront)', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        shopApiMock.mockReset();
        sessionStorageMock.clear();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('clears the customer on a confirmed "not logged in" response', async () => {
        const { useAuthStore } = await import('../../stores/auth');
        shopApiMock.mockResolvedValue({ activeCustomer: null });

        const store = useAuthStore();
        await store.fetchCurrentCustomer();

        expect(store.customer).toBeNull();
        expect(store.isLoggedIn).toBe(false);
        expect(store.authStatus).toBe('unauthenticated');
    });

    it('does not clear an already-known customer on a transient network failure', async () => {
        const { useAuthStore } = await import('../../stores/auth');
        const store = useAuthStore();

        shopApiMock.mockResolvedValueOnce({
            activeCustomer: {
                id: '1',
                firstName: 'A',
                lastName: 'B',
                emailAddress: 'a@b.com',
                customFields: { portalRole: null, preferredTradingPointId: null },
                counterparty: null,
                preferredTradingPoint: null,
            },
        });
        await store.fetchCurrentCustomer();
        expect(store.isLoggedIn).toBe(true);
        expect(store.authStatus).toBe('authenticated');

        shopApiMock.mockRejectedValueOnce(new ApiNetworkError('Failed to fetch'));
        await store.fetchCurrentCustomer();

        expect(store.isLoggedIn).toBe(true);
        expect(store.authStatus).toBe('authenticated');
    });

    it('does not populate the customer from a network failure on first load, stays "unknown"', async () => {
        const { useAuthStore } = await import('../../stores/auth');
        shopApiMock.mockRejectedValue(new ApiNetworkError('Failed to fetch'));

        const store = useAuthStore();
        await store.fetchCurrentCustomer();

        expect(store.customer).toBeNull();
        expect(store.authStatus).toBe('unknown');
        expect(store.isReconnecting).toBe(true);
    });

    it('keeps retrying in the background and stays "unknown" while the outage continues', async () => {
        const { useAuthStore } = await import('../../stores/auth');
        shopApiMock.mockRejectedValueOnce(new ApiNetworkError('Failed to fetch'));

        const store = useAuthStore();
        await store.fetchCurrentCustomer();
        expect(store.isReconnecting).toBe(true);

        shopApiMock.mockRejectedValueOnce(new ApiNetworkError('Failed to fetch'));
        await vi.advanceTimersByTimeAsync(2_000);

        expect(store.authStatus).toBe('unknown');
        expect(store.isReconnecting).toBe(true);
        expect(store.customer).toBeNull();
    });

    it('resolves to "authenticated" once a background retry finally succeeds', async () => {
        const { useAuthStore } = await import('../../stores/auth');
        shopApiMock.mockRejectedValueOnce(new ApiNetworkError('Failed to fetch'));

        const store = useAuthStore();
        await store.fetchCurrentCustomer();
        expect(store.isReconnecting).toBe(true);

        shopApiMock.mockResolvedValueOnce({
            activeCustomer: {
                id: '1',
                firstName: 'A',
                lastName: 'B',
                emailAddress: 'a@b.com',
                customFields: { portalRole: null, preferredTradingPointId: null },
                counterparty: null,
                preferredTradingPoint: null,
            },
        });
        await vi.advanceTimersByTimeAsync(2_000);

        expect(store.authStatus).toBe('authenticated');
        expect(store.isLoggedIn).toBe(true);
        expect(store.isReconnecting).toBe(false);
    });

    it('resolves to "unauthenticated" once a background retry gets a confirmed-null response', async () => {
        const { useAuthStore } = await import('../../stores/auth');
        shopApiMock.mockRejectedValueOnce(new ApiNetworkError('Failed to fetch'));

        const store = useAuthStore();
        await store.fetchCurrentCustomer();
        expect(store.isReconnecting).toBe(true);

        shopApiMock.mockResolvedValueOnce({ activeCustomer: null });
        await vi.advanceTimersByTimeAsync(2_000);

        expect(store.authStatus).toBe('unauthenticated');
        expect(store.isLoggedIn).toBe(false);
        expect(store.isReconnecting).toBe(false);
    });

    it('a stale background retry does not revive customer after an explicit logout', async () => {
        const { useAuthStore } = await import('../../stores/auth');
        shopApiMock.mockRejectedValueOnce(new ApiNetworkError('Failed to fetch'));

        const store = useAuthStore();
        await store.fetchCurrentCustomer();
        expect(store.isReconnecting).toBe(true);

        shopApiMock.mockResolvedValue({ logout: { success: true } });
        await store.logout();
        expect(store.isReconnecting).toBe(false);

        await vi.advanceTimersByTimeAsync(5_000);
        expect(store.customer).toBeNull();
        expect(store.authStatus).toBe('unauthenticated');
    });
});
