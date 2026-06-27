import { ref, watch, type Ref } from 'vue';
import { shopApi } from '../api/client';

interface ProductVariant {
    id: string;
    sku: string;
    price: number;
    customerPrice: number | null;
    currencyCode: string;
    stockLevel: string;
}

interface FacetValue {
    id: string;
    name: string;
    facet: { code: string; name: string };
}

export interface ProductItem {
    id: string;
    name: string;
    slug: string;
    variants: ProductVariant[];
    facetValues: FacetValue[];
}

export type ViewMode = 'list' | 'grid';

interface UseProductListOptions {
    pageSize?: number;
    query?: Ref<string>;
}

export function useProductList(options: UseProductListOptions = {}): {
    items: Ref<ProductItem[]>;
    loading: Ref<boolean>;
    loadingMore: Ref<boolean>;
    hasMore: Ref<boolean>;
    viewMode: Ref<ViewMode>;
    sortKey: Ref<string>;
    loadMore: () => Promise<void>;
    reset: () => void;
    load: () => Promise<void>;
} {
    const { pageSize = 24, query } = options;

    const items = ref<ProductItem[]>([]);
    const loading = ref(false);
    const loadingMore = ref(false);
    const hasMore = ref(true);
    const viewMode = ref<ViewMode>('list');
    const sortKey = ref('stock');
    let currentSkip = 0;

    async function fetchPage(skip: number): Promise<ProductItem[]> {
        const opts: string[] = [`take: ${pageSize}`, `skip: ${skip}`];
        if (query?.value) opts.push(`filter: { name: { contains: "${query.value}" } }`);

        const result = await shopApi<{ products: { items: ProductItem[] } }>(`
            query ProductListPage {
                products(options: { ${opts.join(', ')} }) {
                    items {
                        id name slug
                        variants { id sku price customerPrice currencyCode stockLevel }
                        facetValues { id name facet { code name } }
                    }
                }
            }
        `);
        return result.products.items;
    }

    async function load(): Promise<void> {
        loading.value = true;
        items.value = [];
        currentSkip = 0;
        hasMore.value = true;
        try {
            const page = await fetchPage(0);
            items.value = page;
            currentSkip = page.length;
            hasMore.value = page.length === pageSize;
        } finally {
            loading.value = false;
        }
    }

    async function loadMore(): Promise<void> {
        if (loadingMore.value || !hasMore.value) return;
        loadingMore.value = true;
        try {
            const page = await fetchPage(currentSkip);
            items.value = [...items.value, ...page];
            currentSkip += page.length;
            hasMore.value = page.length === pageSize;
        } finally {
            loadingMore.value = false;
        }
    }

    function reset(): void {
        load();
    }

    if (query) watch(query, reset);
    watch(sortKey, reset);

    return { items, loading, loadingMore, hasMore, viewMode, sortKey, loadMore, reset, load };
}
