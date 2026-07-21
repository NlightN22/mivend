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
                items.value = result.products.items as ProductItem[];
            } else if (mode === 'sales') {
                const result = await shopApi(SaleProductsDocument);
                items.value = result.products.items as ProductItem[];
            } else {
                // Ranked by real order-line quantity (plugin-popular-products), not
                // by ES relevance/filters — fetch the ranked ids first, then the
                // display data via the same `products` query the other widgets use,
                // and reorder client-side since `filter: { id: { in: ... } }` does
                // not preserve the requested id order.
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
                    items.value = ids
                        .map(id => byId.get(id))
                        .filter(
                            (item): item is (typeof result.products.items)[number] => !!item,
                        ) as ProductItem[];
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
