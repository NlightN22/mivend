import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface FavoriteItem {
    variantId: string;
    productSlug: string;
    name: string;
    sku: string;
    brand: string;
    price: number | undefined;
    currency: string;
    stockVariant: 'ok' | 'low' | 'out' | undefined;
    addedAt: number;
}

const STORAGE_KEY = 'mv_favorites';

function load(): FavoriteItem[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as FavoriteItem[]) : [];
    } catch {
        return [];
    }
}

function save(items: FavoriteItem[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export const useFavoritesStore = defineStore('favorites', () => {
    const items = ref<FavoriteItem[]>(load());

    const count = computed(() => items.value.length);

    function has(variantId: string): boolean {
        return items.value.some(i => i.variantId === variantId);
    }

    function toggle(item: FavoriteItem): void {
        const idx = items.value.findIndex(i => i.variantId === item.variantId);
        if (idx !== -1) {
            items.value.splice(idx, 1);
        } else {
            items.value.push({ ...item, addedAt: Date.now() });
        }
        save(items.value);
    }

    function remove(variantId: string): void {
        const idx = items.value.findIndex(i => i.variantId === variantId);
        if (idx !== -1) {
            items.value.splice(idx, 1);
            save(items.value);
        }
    }

    function clear(): void {
        items.value = [];
        localStorage.removeItem(STORAGE_KEY);
    }

    return { items, count, has, toggle, remove, clear };
});
