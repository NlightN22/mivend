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

const PRODUCTS_QUERY = `
    query ProductListPage($take: Int!, $skip: Int!) {
        products(options: { take: $take, skip: $skip }) {
            items {
                id name slug
                variants { id sku price customerPrice currencyCode stockLevel }
                facetValues { id name facet { code name } }
            }
        }
    }
`;

// Use Vendure search API when there's a search term — ES-powered with Russian morphology and fuzzy
const ES_SEARCH_QUERY = `
    query EsProductSearch($term: String!) {
        search(input: { term: $term, groupByProduct: true, take: 100 }) {
            items {
                productId
                productVariantId
                productName
                slug
                sku
                priceWithTax { ... on SinglePrice { value } ... on PriceRange { min } }
                currencyCode
                inStock
                facetValueIds
                customerPrice
            }
            facetValues {
                facetValue { id name facet { code name } }
                count
            }
        }
    }
`;

interface EsSearchItem {
    productId: string;
    productVariantId: string;
    productName: string;
    slug: string;
    sku: string;
    priceWithTax: { value?: number; min?: number } | null;
    currencyCode: string;
    inStock: boolean;
    facetValueIds: string[];
    customerPrice: number | null;
}

interface EsFacetValueResult {
    facetValue: FacetValue;
    count: number;
}

function mapSearchResults(items: EsSearchItem[], facetMap: Map<string, FacetValue>): ProductItem[] {
    return items.map(item => ({
        id: item.productId,
        name: item.productName,
        slug: item.slug,
        variants: [
            {
                id: item.productVariantId,
                sku: item.sku,
                price: item.priceWithTax?.value ?? item.priceWithTax?.min ?? 0,
                customerPrice: item.customerPrice,
                currencyCode: item.currencyCode,
                stockLevel: item.inStock ? 'IN_STOCK' : 'OUT_OF_STOCK',
            },
        ],
        facetValues: item.facetValueIds.flatMap(id => {
            const fv = facetMap.get(id);
            return fv ? [fv] : [];
        }),
    }));
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

    async function fetchSearch(term: string): Promise<ProductItem[]> {
        const result = await shopApi<{
            search: { items: EsSearchItem[]; facetValues: EsFacetValueResult[] };
        }>(ES_SEARCH_QUERY, { term });

        const facetMap = new Map<string, FacetValue>();
        for (const { facetValue } of result.search.facetValues) {
            facetMap.set(facetValue.id, facetValue);
        }

        return mapSearchResults(result.search.items, facetMap);
    }

    async function fetchPage(skip: number): Promise<ProductItem[]> {
        const term = query?.value ?? '';

        if (term) {
            // ES search does not support pagination in our setup — return all at once on first page
            if (skip > 0) return [];
            return fetchSearch(term);
        }

        const result = await shopApi<{ products: { items: ProductItem[] } }>(PRODUCTS_QUERY, {
            take: pageSize,
            skip,
        });
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
            // search mode returns all results at once — no infinite scroll
            hasMore.value = query?.value ? false : page.length === pageSize;
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
