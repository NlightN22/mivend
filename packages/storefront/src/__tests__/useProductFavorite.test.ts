import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ref } from 'vue';
import { useProductFavorite } from '../composables/useProductFavorite';
import { useFavoritesStore } from '../stores/favorites';

describe('useProductFavorite', () => {
    beforeEach(() => {
        const store = new Map<string, string>();
        globalThis.localStorage = {
            getItem: k => store.get(k) ?? null,
            setItem: (k, v) => void store.set(k, v),
            removeItem: k => void store.delete(k),
        } as Storage;
        setActivePinia(createPinia());
    });

    it('toggles the variant on the product page and reflects it reactively', () => {
        const { isFavorited, toggleFavorite } = useProductFavorite(ref('p1'), ref('v1'));
        expect(isFavorited.value).toBe(false);
        toggleFavorite();
        expect(isFavorited.value).toBe(true);
        expect(useFavoritesStore().items).toMatchObject([{ variantId: 'v1', productId: 'p1' }]);
        toggleFavorite();
        expect(isFavorited.value).toBe(false);
    });

    it('does nothing before the product has loaded', () => {
        const { isFavorited, toggleFavorite } = useProductFavorite(ref(undefined), ref(undefined));
        toggleFavorite();
        expect(isFavorited.value).toBe(false);
        expect(useFavoritesStore().count).toBe(0);
    });
});
