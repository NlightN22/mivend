import { ref, watch, type Ref } from 'vue';
import { stockVariantFromLevel, type StockVariant } from '@mivend/ui-kit';
import { shopApi } from '../api/client';
import { FavoriteProductsDocument } from '../api/generated/graphql';
import { useFavoritesStore } from '../stores/favorites';

export interface FavoriteVariantView {
    variantId: string;
    name: string;
    sku: string;
    brand: string;
    price: number | undefined;
    currency: string;
    stockVariant: StockVariant;
}

export function useFavoriteProducts(): {
    views: Ref<FavoriteVariantView[]>;
    loading: Ref<boolean>;
} {
    const store = useFavoritesStore();
    const views = ref<FavoriteVariantView[]>([]);
    const loading = ref(false);
    let requestSeq = 0;

    async function load(): Promise<void> {
        const ids = store.items.map(i => i.variantId);
        const slugs = [...new Set(store.items.map(i => i.productSlug))];
        const seq = ++requestSeq;
        if (ids.length === 0) {
            views.value = [];
            return;
        }
        loading.value = true;
        try {
            const result = await shopApi(FavoriteProductsDocument, { slugs, take: slugs.length });
            if (seq !== requestSeq) return;
            const byVariantId = new Map(
                result.products.items.flatMap(p => p.variants.map(v => [v.id, { p, v }] as const)),
            );
            views.value = ids.flatMap(id => {
                const found = byVariantId.get(id);
                if (!found) return [];
                const { p, v } = found;
                return [
                    {
                        variantId: v.id,
                        name: v.name,
                        sku: v.sku,
                        brand: p.facetValues.find(fv => fv.facet.code === 'brand')?.name ?? '',
                        price: v.customerPrice != null ? v.customerPrice / 100 : undefined,
                        currency: v.currencyCode,
                        stockVariant: stockVariantFromLevel(v.stockLevel),
                    },
                ];
            });
        } catch (e) {
            console.error('[useFavoriteProducts]', e);
            if (seq === requestSeq) views.value = [];
        } finally {
            if (seq === requestSeq) loading.value = false;
        }
    }

    watch(() => store.items.map(i => i.variantId).join(','), load, { immediate: true });

    return { views, loading };
}
