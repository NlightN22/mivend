import { describe, it, expect, beforeEach, vi } from 'vitest';
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
    });
});
