import { ref, watch, type Ref } from 'vue';
import { shopApi } from '../api/client';
import { FavoriteProductsDocument } from '../api/generated/graphql';
import { useFavoritesStore } from '../stores/favorites';
import { assetUrl } from './assetUrl';
import type { ProductItem } from './useProductList';

const ID_BATCH = 100;

export function useFavoriteProducts(): {
    products: Ref<ProductItem[]>;
    loading: Ref<boolean>;
    error: Ref<boolean>;
} {
    const store = useFavoritesStore();
    const products = ref<ProductItem[]>([]);
    const loading = ref(false);
    const error = ref(false);
    let requestSeq = 0;

    async function load(): Promise<void> {
        const ids = store.items.map(i => i.variantId);
        const productIds = [...new Set(store.items.map(i => i.productId))];
        const seq = ++requestSeq;
        if (ids.length === 0) {
            products.value = [];
            return;
        }
        loading.value = true;
        error.value = false;
        try {
            const batches = Array.from(
                { length: Math.ceil(productIds.length / ID_BATCH) },
                (_, i) => productIds.slice(i * ID_BATCH, (i + 1) * ID_BATCH),
            );
            const results = await Promise.all(
                batches.map(batch =>
                    shopApi(FavoriteProductsDocument, { ids: batch, take: batch.length }),
                ),
            );
            if (seq !== requestSeq) return;
            const byVariantId = new Map(
                results
                    .flatMap(r => r.products.items)
                    .flatMap(p => p.variants.map(v => [v.id, { p, v }] as const)),
            );
            products.value = ids.flatMap(id => {
                const found = byVariantId.get(id);
                if (!found) return [];
                const { p, v } = found;
                return [
                    {
                        id: p.id,
                        name: p.name,
                        slug: p.slug,
                        manufacturer: p.manufacturer,
                        images: p.assets.map(a => assetUrl(a.preview, 'small')),
                        facetValues: [],
                        variants: [
                            {
                                id: v.id,
                                sku: v.sku,
                                price: v.customerPrice ?? v.price ?? undefined,
                                customerPrice: v.customerPrice ?? null,
                                compareAtPrice: v.compareAtPrice ?? null,
                                discountTiers: [],
                                currencyCode: v.currencyCode,
                                stockLevel: v.stockLevel,
                                unitName: v.customFields?.unitName ?? null,
                                unitRatioToBase: v.customFields?.unitRatioToBase ?? null,
                            },
                        ],
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

    return { products, loading, error };
}
