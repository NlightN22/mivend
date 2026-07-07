import { ref } from 'vue';
import { shopApi } from '../api/client';
import type { ProductItem } from './useProductList';

export type WidgetMode = 'new-arrivals' | 'sales' | 'popular';

const WIDGET_QUERY = `
    id name slug
    variants { id sku price customerPrice compareAtPrice discountTiers { percent minWeightKg minAmount } currencyCode stockLevel }
    facetValues { id name facet { code name } }
`;

export function useWidgetProducts(mode: WidgetMode): {
    items: ReturnType<typeof ref<ProductItem[]>>;
    loading: ReturnType<typeof ref<boolean>>;
    load: () => Promise<void>;
} {
    const items = ref<ProductItem[]>([]);
    const loading = ref(false);

    async function load(): Promise<void> {
        loading.value = true;
        try {
            if (mode === 'new-arrivals') {
                const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
                const result = await shopApi<{ products: { items: ProductItem[] } }>(`
                    query NewArrivals {
                        products(options: {
                            take: 12,
                            sort: { createdAt: DESC },
                            filter: { createdAt: { after: "${since}" } }
                        }) {
                            items { ${WIDGET_QUERY} }
                        }
                    }
                `);
                items.value = result.products.items;
            } else if (mode === 'sales') {
                const result = await shopApi<{ products: { items: ProductItem[] } }>(`
                    query SaleProducts {
                        products(options: {
                            take: 40,
                            filter: { onSale: { eq: true } }
                        }) {
                            items { ${WIDGET_QUERY} }
                        }
                    }
                `);
                items.value = result.products.items;
            } else {
                // Ranked by real order-line quantity (plugin-popular-products), not
                // by ES relevance/filters — fetch the ranked ids first, then the
                // display data via the same `products` query the other widgets use,
                // and reorder client-side since `filter: { id: { in: ... } }` does
                // not preserve the requested id order.
                const idsResult = await shopApi<{ popularProductIds: string[] }>(`
                    query PopularProductIds { popularProductIds(take: 12) }
                `);
                const ids = idsResult.popularProductIds;
                if (ids.length === 0) {
                    items.value = [];
                } else {
                    const result = await shopApi<{ products: { items: ProductItem[] } }>(
                        `
                        query PopularProducts($ids: [String!]!) {
                            products(options: { take: ${ids.length}, filter: { id: { in: $ids } } }) {
                                items { ${WIDGET_QUERY} }
                            }
                        }
                    `,
                        { ids },
                    );
                    const byId = new Map(result.products.items.map(item => [item.id, item]));
                    items.value = ids
                        .map(id => byId.get(id))
                        .filter((item): item is ProductItem => !!item);
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
