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

const SLUG_BATCH = 100;

export function useFavoriteProducts(): {
    views: Ref<FavoriteVariantView[]>;
    loading: Ref<boolean>;
    error: Ref<boolean>;
} {
    const store = useFavoritesStore();
    const views = ref<FavoriteVariantView[]>([]);
    const loading = ref(false);
    const error = ref(false);
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
        error.value = false;
        try {
            const batches = Array.from({ length: Math.ceil(slugs.length / SLUG_BATCH) }, (_, i) =>
                slugs.slice(i * SLUG_BATCH, (i + 1) * SLUG_BATCH),
            );
            const results = await Promise.all(
                batches.map(batch =>
                    shopApi(FavoriteProductsDocument, { slugs: batch, take: batch.length }),
                ),
            );
            if (seq !== requestSeq) return;
            const byVariantId = new Map(
                results
                    .flatMap(r => r.products.items)
                    .flatMap(p => p.variants.map(v => [v.id, { p, v }] as const)),
            );
            ids.filter(id => !byVariantId.has(id)).forEach(id => store.remove(id));
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
            if (seq === requestSeq) error.value = true;
        } finally {
            if (seq === requestSeq) loading.value = false;
        }
    }

    watch(() => store.items.map(i => i.variantId).join(','), load, { immediate: true });

    return { views, loading, error };
}
