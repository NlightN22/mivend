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

const adminApiMock = vi.fn();
vi.mock('../../api/client', async () => {
    const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
    return { ...actual, adminApi: (...args: unknown[]) => adminApiMock(...args) };
});

describe('useAuthStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        adminApiMock.mockReset();
        sessionStorageMock.clear();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('clears the administrator on a confirmed "not logged in" response', async () => {
        const { useAuthStore } = await import('../../stores/auth');
        adminApiMock.mockResolvedValue({ activeAdministrator: null });

        const store = useAuthStore();
        await store.fetchActiveAdministrator();

        expect(store.administrator).toBeNull();
        expect(store.isLoggedIn).toBe(false);
    });

    it('does not clear an already-known administrator on a transient network failure', async () => {
        const { useAuthStore } = await import('../../stores/auth');
        const store = useAuthStore();

        adminApiMock.mockResolvedValueOnce({
            activeAdministrator: {
                id: '1',
                firstName: 'A',
                lastName: 'B',
                emailAddress: 'a@b.com',
                customFields: { departmentId: null, branchId: null },
                user: { roles: [] },
            },
        });
        await store.fetchActiveAdministrator();
        expect(store.isLoggedIn).toBe(true);

        // A later re-check fails only because the server is momentarily unreachable.
        adminApiMock.mockRejectedValueOnce(new ApiNetworkError('Failed to fetch'));
        await store.fetchActiveAdministrator();

        expect(store.isLoggedIn).toBe(true);
    });

    it('does not populate the administrator from a network failure on first load either', async () => {
        const { useAuthStore } = await import('../../stores/auth');
        adminApiMock.mockRejectedValue(new ApiNetworkError('Failed to fetch'));

        const store = useAuthStore();
        await store.fetchActiveAdministrator();

        // Nothing was ever confirmed either way — stays in the initial "unknown" state, not
        // force-logged-out, but also not incorrectly marked as logged in.
        expect(store.administrator).toBeNull();
        expect(store.authStatus).toBe('unknown');
        expect(store.isReconnecting).toBe(true);
    });

    it('starts a background retry after a network failure and stays "unknown", never "unauthenticated"', async () => {
        const { useAuthStore } = await import('../../stores/auth');
        adminApiMock.mockRejectedValueOnce(new ApiNetworkError('Failed to fetch'));

        const store = useAuthStore();
        await store.fetchActiveAdministrator();

        expect(store.authStatus).toBe('unknown');
        expect(store.isReconnecting).toBe(true);

        // Still failing on the first background attempt.
        adminApiMock.mockRejectedValueOnce(new ApiNetworkError('Failed to fetch'));
        await vi.advanceTimersByTimeAsync(2_000);

        expect(store.authStatus).toBe('unknown');
        expect(store.isReconnecting).toBe(true);
        expect(store.administrator).toBeNull();
    });

    it('resolves to "authenticated" once a background retry finally succeeds', async () => {
        const { useAuthStore } = await import('../../stores/auth');
        adminApiMock.mockRejectedValueOnce(new ApiNetworkError('Failed to fetch'));

        const store = useAuthStore();
        await store.fetchActiveAdministrator();
        expect(store.isReconnecting).toBe(true);

        adminApiMock.mockResolvedValueOnce({
            activeAdministrator: {
                id: '1',
                firstName: 'A',
                lastName: 'B',
                emailAddress: 'a@b.com',
                customFields: { departmentId: null, branchId: null },
                user: { roles: [] },
            },
        });
        await vi.advanceTimersByTimeAsync(2_000);

        expect(store.authStatus).toBe('authenticated');
        expect(store.isLoggedIn).toBe(true);
        expect(store.isReconnecting).toBe(false);
    });

    it('resolves to "unauthenticated" once a background retry gets a confirmed-null response', async () => {
        const { useAuthStore } = await import('../../stores/auth');
        adminApiMock.mockRejectedValueOnce(new ApiNetworkError('Failed to fetch'));

        const store = useAuthStore();
        await store.fetchActiveAdministrator();
        expect(store.isReconnecting).toBe(true);

        adminApiMock.mockResolvedValueOnce({ activeAdministrator: null });
        await vi.advanceTimersByTimeAsync(2_000);

        expect(store.authStatus).toBe('unauthenticated');
        expect(store.isLoggedIn).toBe(false);
        expect(store.isReconnecting).toBe(false);
    });

    it('a non-network error (e.g. a transient GraphQL/DB error) also stays "unknown", never "unauthenticated"', async () => {
        const { useAuthStore } = await import('../../stores/auth');
        // Vendure's activeAdministrator query never throws for "not logged in" — a genuine
        // logout always comes back as a clean, successful `null`. Any thrown error, even one
        // that isn't ApiNetworkError, is therefore ambiguous and must not force a logout.
        adminApiMock.mockRejectedValueOnce(new Error('Internal server error'));

        const store = useAuthStore();
        await store.fetchActiveAdministrator();

        expect(store.authStatus).toBe('unknown');
        expect(store.isReconnecting).toBe(true);
        expect(store.administrator).toBeNull();

        adminApiMock.mockResolvedValueOnce({
            activeAdministrator: {
                id: '1',
                firstName: 'A',
                lastName: 'B',
                emailAddress: 'a@b.com',
                customFields: { departmentId: null, branchId: null },
                user: { roles: [] },
            },
        });
        await vi.advanceTimersByTimeAsync(2_000);

        expect(store.authStatus).toBe('authenticated');
        expect(store.isReconnecting).toBe(false);
    });

    it('a stale background retry does not revive administrator after an explicit logout', async () => {
        const { useAuthStore } = await import('../../stores/auth');
        adminApiMock.mockRejectedValueOnce(new ApiNetworkError('Failed to fetch'));

        const store = useAuthStore();
        await store.fetchActiveAdministrator();
        expect(store.isReconnecting).toBe(true);

        adminApiMock.mockResolvedValue({ logout: { success: true } });
        await store.logout();
        expect(store.isReconnecting).toBe(false);

        // If the stale timer somehow still fired, it must be a no-op (generation superseded).
        await vi.advanceTimersByTimeAsync(5_000);
        expect(store.administrator).toBeNull();
        expect(store.authStatus).toBe('unauthenticated');
    });
});
