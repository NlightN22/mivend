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

export interface FacetValue {
    id: string;
    name: string;
    facet: { code: string; name: string };
}

export interface FacetGroup {
    code: string;
    name: string;
    values: { id: string; name: string; count: number }[];
}

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
}

interface EsFacetValueResult {
    facetValue: FacetValue;
    count: number;
}

const SEARCH_QUERY = `
    query CatalogSearch($term: String, $take: Int!, $skip: Int!, $facetValueFilters: [FacetValueFilterInput!], $inStock: Boolean, $priceRangeWithTax: PriceRangeInput) {
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
            }
            facetValues {
                facetValue { id name facet { code name } }
                count
            }
        }
    }
`;

// Values from the same facet group → OR (e.g. Castrol OR Lukoil)
// Values from different facet groups → AND (e.g. brand=Castrol AND category=Engine Oils)
// facetGroups is passed in to know which id belongs to which facet
function buildFacetValueFilters(
    ids: string[],
    facetGroups: Array<{ values: Array<{ id: string }> }>,
): { or: string[] }[] {
    if (ids.length === 0) return [];
    const idSet = new Set(ids);
    const groups: string[][] = [];
    const covered = new Set<string>();
    for (const group of facetGroups) {
        const groupIds = group.values.map(v => v.id).filter(id => idSet.has(id));
        if (groupIds.length > 0) {
            groups.push(groupIds);
            groupIds.forEach(id => covered.add(id));
        }
    }
    // Any ids not covered by known groups go into their own OR group
    const uncovered = ids.filter(id => !covered.has(id));
    if (uncovered.length > 0) groups.push(uncovered);
    return groups.map(g => ({ or: g }));
}

function mapItems(items: EsSearchItem[], facetMap: Map<string, FacetValue>): ProductItem[] {
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
    facetGroups: Ref<FacetGroup[]>;
    totalItems: Ref<number>;
    loading: Ref<boolean>;
    loadingMore: Ref<boolean>;
    hasMore: Ref<boolean>;
    viewMode: Ref<ViewMode>;
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
    const viewMode = ref<ViewMode>('list');
    const sortKey = ref('stock');
    let currentSkip = 0;

    async function fetchPage(skip: number): Promise<{
        items: ProductItem[];
        facetGroups: FacetGroup[];
        total: number;
    }> {
        const term = query?.value || undefined;
        const facetValueIds = filters?.value.facetValueIds ?? [];
        const inStock = filters?.value.inStock ? true : undefined;
        const priceMin = filters?.value.priceMin;
        const priceMax = filters?.value.priceMax;
        const priceRangeWithTax =
            priceMin != null || priceMax != null
                ? {
                      min: priceMin != null ? Math.round(priceMin * 100) : 0,
                      max: priceMax != null ? Math.round(priceMax * 100) : 999_999_999,
                  }
                : undefined;

        const result = await shopApi<{
            search: {
                totalItems: number;
                items: EsSearchItem[];
                facetValues: EsFacetValueResult[];
            };
        }>(SEARCH_QUERY, {
            term,
            take: pageSize,
            skip,
            facetValueFilters: buildFacetValueFilters(facetValueIds, facetGroups.value),
            inStock,
            priceRangeWithTax,
        });

        const facetMap = new Map<string, FacetValue>();
        for (const { facetValue } of result.search.facetValues) {
            facetMap.set(facetValue.id, facetValue);
        }

        // Build facet groups from search result facetValues
        const groupMap = new Map<string, FacetGroup>();
        for (const { facetValue, count } of result.search.facetValues) {
            const { code, name } = facetValue.facet;
            if (!groupMap.has(code)) groupMap.set(code, { code, name, values: [] });
            groupMap.get(code)!.values.push({ id: facetValue.id, name: facetValue.name, count });
        }
        const groups = [...groupMap.values()].map(g => ({
            ...g,
            values: g.values.sort((a, b) => a.name.localeCompare(b.name)),
        }));

        return {
            items: mapItems(result.search.items, facetMap),
            facetGroups: groups,
            total: result.search.totalItems,
        };
    }

    let loadSeq = 0;

    async function load(): Promise<void> {
        const seq = ++loadSeq;
        loading.value = true;
        let page;
        try {
            page = await fetchPage(0);
        } catch (e) {
            if (seq === loadSeq) loading.value = false;
            throw e;
        }
        if (seq !== loadSeq) return; // superseded — discard result, loading already cleared by newer call
        items.value = page.items;
        facetGroups.value = page.facetGroups;
        totalItems.value = page.total;
        currentSkip = page.items.length;
        hasMore.value = page.items.length === pageSize && currentSkip < page.total;
        loading.value = false;
    }

    async function loadMore(): Promise<void> {
        if (loadingMore.value || !hasMore.value) return;
        loadingMore.value = true;
        try {
            const page = await fetchPage(currentSkip);
            items.value = [...items.value, ...page.items];
            currentSkip += page.items.length;
            hasMore.value = currentSkip < page.total;
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
        sortKey,
        loadMore,
        load,
    };
}
