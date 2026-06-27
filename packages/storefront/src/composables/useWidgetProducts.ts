import { ref } from 'vue';
import { shopApi } from '../api/client';
import type { ProductItem } from './useProductList';

export type WidgetMode = 'new-arrivals' | 'sales';

const WIDGET_QUERY = `
    id name slug
    variants { id sku price customerPrice currencyCode stockLevel }
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
            } else {
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
