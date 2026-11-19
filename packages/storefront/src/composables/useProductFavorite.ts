import { computed, type ComputedRef, type Ref } from 'vue';
import { useFavoritesStore } from '../stores/favorites';

export function useProductFavorite(
    productId: Ref<string | undefined>,
    variantId: Ref<string | undefined>,
): { isFavorited: ComputedRef<boolean>; toggleFavorite: () => void } {
    const favorites = useFavoritesStore();
    const isFavorited = computed(() => !!variantId.value && favorites.has(variantId.value));
    function toggleFavorite(): void {
        if (variantId.value && productId.value) favorites.toggle(variantId.value, productId.value);
    }
    return { isFavorited, toggleFavorite };
}
