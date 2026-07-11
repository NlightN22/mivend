import { ref, watch, type Ref } from 'vue';
import { shopApi } from '../api/client';
import { useViewMode } from './useViewMode';
// Imports the TS source directly (not the 'shared' package's compiled CJS output): Vite/Rollup
// couldn't reliably interop either the aggregator (`export *` compiled to a runtime
// __exportStar loop) or the compiled catalogFacets.js directly — importing the source lets
// esbuild/Vite include it as plain ESM in the same module graph, with no CJS boundary at all.
// sync.ts (shared's other export) is only ever consumed by ts-node/Node backend code via the
// compiled 'shared' package, so this never surfaced before.
import {
    buildFacetValueFilters,
    buildFacetGroups,
    type FacetGroup,
    type FacetValue,
    type EsFacetValueResult,
} from '../../../shared/src/catalogFacets';

export interface DiscountTierVM {
    percent: number;
    minWeightKg: number | null;
    minAmount: number | null;
}

interface ProductVariant {
    id: string;
    sku: string;
    price: number;
    customerPrice: number | null;
    compareAtPrice: number | null;
    discountTiers: DiscountTierVM[];
    currencyCode: string;
    stockLevel: string;
}

export type { FacetGroup, FacetValue } from 'shared';

export interface ProductItem {
    id: string;
    name: string;
    slug: string;
    variants: ProductVariant[];
    facetValues: FacetValue[];
}

export type ViewMode = 'list' | 'grid';

export interface FilterState {
    facetValueIds: string[];
    inStock: boolean;
    priceMin: number | null;
    priceMax: number | null;
}

interface UseProductListOptions {
    pageSize?: number;
    query?: Ref<string>;
    filters?: Ref<FilterState>;
}

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
    compareAtPrice: number | null;
    discountTiers: DiscountTierVM[];
}

interface SearchResult {
    totalItems: number;
    items: EsSearchItem[];
    facetValues: EsFacetValueResult[];
}

// Products query — all filters applied
const PRODUCTS_QUERY = `
    query CatalogProducts($term: String, $take: Int!, $skip: Int!, $facetValueFilters: [FacetValueFilterInput!], $inStock: Boolean, $priceRangeWithTax: PriceRangeInput) {
        search(input: {
            term: $term
            take: $take
            skip: $skip
            groupByProduct: true
            facetValueFilters: $facetValueFilters
            inStock: $inStock
            priceRangeWithTax: $priceRangeWithTax
        }) {
            totalItems
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
                compareAtPrice
                discountTiers { percent minWeightKg minAmount }
            }
            facetValues {
                facetValue { id code name facet { code name } }
                count
            }
        }
    }
`;

// Facets query — only term + price range, NO facetValueFilters
// This keeps the full facet panel visible regardless of active facet selections.
const FACETS_QUERY = `
    query CatalogFacets($term: String, $inStock: Boolean, $priceRangeWithTax: PriceRangeInput) {
        search(input: {
            term: $term
            take: 0
            skip: 0
            groupByProduct: true
            inStock: $inStock
            priceRangeWithTax: $priceRangeWithTax
        }) {
            facetValues {
                facetValue { id code name facet { code name } }
                count
            }
        }
    }
`;

function mapItems(items: EsSearchItem[], facetValues: EsFacetValueResult[]): ProductItem[] {
    const facetMap = new Map<string, FacetValue>();
    for (const { facetValue } of facetValues) {
        facetMap.set(facetValue.id, facetValue);
    }
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
                compareAtPrice: item.compareAtPrice,
                discountTiers: item.discountTiers,
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
    facetGroups: Ref<FacetGroup[]>;
    totalItems: Ref<number>;
    loading: Ref<boolean>;
    loadingMore: Ref<boolean>;
    hasMore: Ref<boolean>;
    viewMode: Ref<ViewMode>;
    setViewMode: (mode: ViewMode) => void;
    sortKey: Ref<string>;
    loadMore: () => Promise<void>;
    load: () => Promise<void>;
} {
    const { pageSize = 24, query, filters } = options;

    const items = ref<ProductItem[]>([]);
    const facetGroups = ref<FacetGroup[]>([]);
    const totalItems = ref(0);
    const loading = ref(false);
    const loadingMore = ref(false);
    const hasMore = ref(true);
    const { viewMode, setViewMode } = useViewMode();
    const sortKey = ref('stock');
    let currentSkip = 0;

    function buildPriceRange() {
        const priceMin = filters?.value.priceMin;
        const priceMax = filters?.value.priceMax;
        if (priceMin == null && priceMax == null) return undefined;
        return {
            min: priceMin != null ? Math.round(priceMin * 100) : 0,
            max: priceMax != null ? Math.round(priceMax * 100) : 999_999_999,
        };
    }

    async function fetchProducts(skip: number): Promise<{ search: SearchResult }> {
        const term = query?.value || undefined;
        const facetValueIds = filters?.value.facetValueIds ?? [];
        return shopApi<{ search: SearchResult }>(PRODUCTS_QUERY, {
            term,
            take: pageSize,
            skip,
            facetValueFilters: buildFacetValueFilters(facetValueIds, facetGroups.value),
            inStock: filters?.value.inStock ? true : undefined,
            priceRangeWithTax: buildPriceRange(),
        });
    }

    async function fetchFacets(): Promise<{ search: Pick<SearchResult, 'facetValues'> }> {
        const term = query?.value || undefined;
        return shopApi<{ search: Pick<SearchResult, 'facetValues'> }>(FACETS_QUERY, {
            term,
            inStock: filters?.value.inStock ? true : undefined,
            priceRangeWithTax: buildPriceRange(),
        });
    }

    let loadSeq = 0;

    async function load(): Promise<void> {
        const seq = ++loadSeq;
        loading.value = true;
        let productsResult: { search: SearchResult };
        let facetsResult: { search: Pick<SearchResult, 'facetValues'> } | null;
        try {
            [productsResult, facetsResult] = await Promise.all([
                fetchProducts(0),
                fetchFacets().catch(() => null),
            ]);
        } catch (e) {
            if (seq === loadSeq) loading.value = false;
            throw e;
        }
        if (seq !== loadSeq) return;

        const facetValues = facetsResult?.search.facetValues ?? productsResult.search.facetValues;
        facetGroups.value = buildFacetGroups(facetValues);
        items.value = mapItems(productsResult.search.items, facetValues);
        totalItems.value = productsResult.search.totalItems;
        currentSkip = productsResult.search.items.length;
        hasMore.value =
            productsResult.search.items.length === pageSize &&
            currentSkip < productsResult.search.totalItems;
        loading.value = false;
    }

    async function loadMore(): Promise<void> {
        // While a fresh load() is in flight, currentSkip/hasMore reflect the previous
        // filter state — appending here would race the replacement in load() and
        // duplicate rows once both resolve (seen when a narrow filter's IntersectionObserver
        // sentinel is already in view before the first load() response lands).
        if (loading.value || loadingMore.value || !hasMore.value) return;
        const seq = loadSeq;
        loadingMore.value = true;
        try {
            const result = await fetchProducts(currentSkip);
            if (seq !== loadSeq) return; // a load() started/finished while this was in flight
            items.value = [...items.value, ...mapItems(result.search.items, [])];
            currentSkip += result.search.items.length;
            hasMore.value = currentSkip < result.search.totalItems;
        } finally {
            loadingMore.value = false;
        }
    }

    if (query) watch(query, load);
    if (filters) watch(filters, load, { deep: true });
    watch(sortKey, load);

    return {
        items,
        facetGroups,
        totalItems,
        loading,
        loadingMore,
        hasMore,
        viewMode,
        setViewMode,
        sortKey,
        loadMore,
        load,
    };
}
