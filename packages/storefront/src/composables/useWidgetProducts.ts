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

// The `products` query's `variant.price` is Vendure's raw listPrice (ERP import price,
// price-type-agnostic) — never a value to display (issue #70, same class of bug as
// useProductList.ts's raw `priceWithTax`). Widget cards only ever read `customerPrice`/
// `compareAtPrice` (populated by ProductVariantPriceResolver via PriceResolutionService,
// which now always resolves a real price — the customer's own, or the branch default-price-type
// fallback — never null except a genuinely unconfigured/pre-bootstrap system), so overwrite
// `price` with that here instead of trusting the raw field.
function withResolvedPrice(items: ProductItem[]): ProductItem[] {
    return items.map(item => ({
        ...item,
        variants: item.variants.map(variant => ({
            ...variant,
            price: variant.customerPrice ?? 0,
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
