import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

const localStorageMock = (() => {
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

vi.stubGlobal('localStorage', localStorageMock);

describe('useFavoritesStore', () => {
    beforeEach(() => {
        localStorageMock.clear();
        setActivePinia(createPinia());
    });

    it('toggle adds item when not present', async () => {
        const { useFavoritesStore } = await import('../../stores/favorites');
        const store = useFavoritesStore();
        store.toggle('v1', 'product-1');
        expect(store.items).toHaveLength(1);
        expect(store.items[0].variantId).toBe('v1');
    });

    it('toggle removes item when already present', async () => {
        const { useFavoritesStore } = await import('../../stores/favorites');
        const store = useFavoritesStore();
        store.toggle('v1', 'product-1');
        store.toggle('v1', 'product-1');
        expect(store.items).toHaveLength(0);
    });

    it('has returns true when item is favorited', async () => {
        const { useFavoritesStore } = await import('../../stores/favorites');
        const store = useFavoritesStore();
        store.toggle('v1', 'product-1');
        expect(store.has('v1')).toBe(true);
        expect(store.has('v2')).toBe(false);
    });

    it('remove deletes specific item', async () => {
        const { useFavoritesStore } = await import('../../stores/favorites');
        const store = useFavoritesStore();
        store.toggle('v1', 'product-1');
        store.toggle('v2', 'product-1');
        store.remove('v1');
        expect(store.items).toHaveLength(1);
        expect(store.items[0].variantId).toBe('v2');
    });

    it('count reflects number of items', async () => {
        const { useFavoritesStore } = await import('../../stores/favorites');
        const store = useFavoritesStore();
        expect(store.count).toBe(0);
        store.toggle('v1', 'product-1');
        expect(store.count).toBe(1);
    });

    it('persists to localStorage on toggle', async () => {
        const { useFavoritesStore } = await import('../../stores/favorites');
        const store = useFavoritesStore();
        store.toggle('v1', 'product-1');
        const stored = JSON.parse(localStorageMock.getItem('mv_favorites') ?? '[]');
        expect(stored).toHaveLength(1);
        expect(stored[0].variantId).toBe('v1');
    });

    it('stores no price or stock snapshot; drops legacy entries without a productId on load', async () => {
        localStorageMock.setItem(
            'mv_favorites',
            JSON.stringify([
                { variantId: 'v1', productId: 'p1', price: 100, stockVariant: 'high', addedAt: 1 },
                { variantId: 'v2', productSlug: 'old-shape', addedAt: 2 },
            ]),
        );
        const { useFavoritesStore } = await import('../../stores/favorites');
        const store = useFavoritesStore();
        expect(store.items).toEqual([{ variantId: 'v1', productId: 'p1', addedAt: 1 }]);
    });

    it('clear removes all items and localStorage', async () => {
        const { useFavoritesStore } = await import('../../stores/favorites');
        const store = useFavoritesStore();
        store.toggle('v1', 'product-1');
        store.clear();
        expect(store.items).toHaveLength(0);
        expect(localStorageMock.getItem('mv_favorites')).toBeNull();
    });
});
