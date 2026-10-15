import { ref, type Ref } from 'vue';
import { shopApi } from '../api/client';
import {
    NewArrivalsDocument,
    PopularProductIdsDocument,
    PopularProductsDocument,
    SaleProductsDocument,
} from '../api/generated/graphql';
import type { ProductItem } from './useProductList';

export type WidgetMode = 'new-arrivals' | 'sales' | 'popular';

// Overwrite price with customerPrice: variant.price is the raw ERP listPrice, not price-type-aware.
// Widget cards must never show the raw field, so the resolved customer price replaces it here.
export function withResolvedPrice(items: ProductItem[]): ProductItem[] {
    return items.map(item => ({
        ...item,
        variants: item.variants.map(variant => ({
            ...variant,
            // undefined, not 0, when unresolved (audit finding, mivend.audit.70) — same fix as
            // useProductList.ts, see its ProductVariant.price comment.
            price: variant.customerPrice ?? undefined,
        })),
    }));
}

export function useWidgetProducts(mode: WidgetMode): {
    items: Ref<ProductItem[]>;
    loading: Ref<boolean>;
    load: () => Promise<void>;
} {
    const items = ref<ProductItem[]>([]);
    const loading = ref(false);

    async function load(): Promise<void> {
        loading.value = true;
        try {
            if (mode === 'new-arrivals') {
                const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
                const result = await shopApi(NewArrivalsDocument, { since });
                items.value = withResolvedPrice(result.products.items as ProductItem[]);
            } else if (mode === 'sales') {
                const result = await shopApi(SaleProductsDocument);
                items.value = withResolvedPrice(result.products.items as ProductItem[]);
            } else {
                // Ranking is by real order-line quantity from plugin-popular-products, not ES relevance.
                // The products `in` filter drops the requested id order, so reorder client-side.
                const idsResult = await shopApi(PopularProductIdsDocument);
                const ids = idsResult.popularProductIds;
                if (ids.length === 0) {
                    items.value = [];
                } else {
                    const result = await shopApi(PopularProductsDocument, {
                        ids,
                        take: ids.length,
                    });
                    const byId = new Map(result.products.items.map(item => [item.id, item]));
                    items.value = withResolvedPrice(
                        ids
                            .map(id => byId.get(id))
                            .filter(
                                (item): item is (typeof result.products.items)[number] => !!item,
                            ) as ProductItem[],
                    );
                }
            }
        } catch (e) {
            console.error(`[useWidgetProducts:${mode}]`, e);
            items.value = [];
        } finally {
            loading.value = false;
        }
    }

    return { items, loading, load };
}
