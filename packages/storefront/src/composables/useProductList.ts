import { orderFacetGroups } from './facetOrder';
import { describeLoadError, type LoadErrorText } from '../api/describeLoadError';
import { ref, watch, type Ref } from 'vue';
import { shopApi } from '../api/client';
import { assetUrl } from './assetUrl';
import { buildSort, type SortOption } from './search-sort';
import { useSearchCapabilities } from './useSearchCapabilities';
import {
    CatalogFacetsDocument,
    CatalogProductsDocument,
    type CatalogFacetsQuery,
    type CatalogProductsQuery,
} from '../api/generated/graphql';
import { isCollectionVisible } from './collectionVisible';
import { useViewMode } from './useViewMode';
// Imports TS source, not compiled 'shared' CJS: Vite/Rollup can't interop its __exportStar
// aggregator, so it stays plain ESM in the same module graph with no CJS boundary.
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
    // Undefined, not 0: a 0 would make an unresolved price look like a genuinely free product.
    // A real 'no price' state only occurs before bootstrap or on misconfiguration.
    price: number | undefined;
    customerPrice: number | null;
    compareAtPrice: number | null;
    discountTiers: DiscountTierVM[];
    currencyCode: string;
    stockLevel: string;
    unitName: string | null;
    unitRatioToBase: number | null;
    multiplicity?: number | null;
    packagingLevels?: { name: string; ratioToBase: number }[];
}

export type { FacetGroup, FacetValue } from 'shared';

export interface ProductItem {
    id: string;
    name: string;
    slug: string;
    variants: ProductVariant[];
    facetValues: FacetValue[];
    manufacturer?: { name?: string | null } | null;
    images: string[];
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
    initialSort?: string;
    filters?: Ref<FilterState>;
    collectionSlug?: Ref<string | undefined>;
}

type EsSearchItem = CatalogProductsQuery['search']['items'][number];

function mapItems(items: EsSearchItem[], facetValues: EsFacetValueResult[]): ProductItem[] {
    const facetMap = new Map<string, FacetValue>();
    for (const { facetValue } of facetValues) {
        facetMap.set(facetValue.id, facetValue);
    }
    return items.map(item => ({
        id: item.productId,
        name: item.productName,
        slug: item.slug,
        manufacturer: item.manufacturer,
        images: item.galleryPreviews.map(preview => assetUrl(preview, 'small')),
        variants: [
            {
                id: item.productVariantId,
                sku: item.sku,
                // Never use priceWithTax: a placeholder under SEARCH_BACKEND=external, and customer-agnostic.
                // Only customerPrice is valid: the resolver always supplies it, with the branch fallback.
                price: item.customerPrice ?? undefined,
                customerPrice: item.customerPrice ?? null,
                compareAtPrice: item.compareAtPrice ?? null,
                discountTiers: item.discountTiers.map(tier => ({
                    percent: tier.percent,
                    minWeightKg: tier.minWeightKg ?? null,
                    minAmount: tier.minAmount ?? null,
                })),
                currencyCode: item.currencyCode,
                stockLevel: item.stockLevel,
                unitName: item.unitName ?? null,
                unitRatioToBase: item.unitRatioToBase ?? null,
                multiplicity: item.multiplicity ?? null,
                packagingLevels: item.packagingLevels,
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
    categoryCounts: Ref<Map<string, number>>;
    categoryCountsLoading: Ref<boolean>;
    totalItems: Ref<number>;
    loading: Ref<boolean>;
    loadError: Ref<boolean>;
    loadErrorInfo: Ref<LoadErrorText>;
    loadingMore: Ref<boolean>;
    hasMore: Ref<boolean>;
    viewMode: Ref<ViewMode>;
    setViewMode: (mode: ViewMode) => void;
    sortKey: Ref<string>;
    sortOptions: Readonly<Ref<SortOption[]>>;
    priceRangeSupported: Ref<boolean>;
    loadMore: () => Promise<void>;
    load: () => Promise<void>;
} {
    const { pageSize = 24, query, filters, collectionSlug, initialSort } = options;

    const items = ref<ProductItem[]>([]);
    const facetGroups = ref<FacetGroup[]>([]);
    const categoryCounts = ref(new Map<string, number>());
    const categoryCountsLoading = ref(false);
    const totalItems = ref(0);
    const loading = ref(false);
    const loadError = ref(false);
    const loadErrorInfo = ref<LoadErrorText>(describeLoadError(null));
    const loadingMore = ref(false);
    const hasMore = ref(true);
    const { viewMode, setViewMode } = useViewMode();
    const sortKey = ref(initialSort || 'relevance');
    const {
        sortOptions,
        priceRange: priceRangeSupported,
        ready: capabilitiesReady,
    } = useSearchCapabilities();
    let currentSkip = 0;

    function buildPriceRange(): { min: number; max: number } | undefined {
        const priceMin = filters?.value.priceMin;
        const priceMax = filters?.value.priceMax;
        if (!priceRangeSupported.value || (priceMin == null && priceMax == null)) return undefined;
        return {
            min: priceMin != null ? Math.round(priceMin * 100) : 0,
            max: priceMax != null ? Math.round(priceMax * 100) : 999_999_999,
        };
    }

    async function fetchProducts(skip: number): Promise<CatalogProductsQuery> {
        const term = query?.value || undefined;
        const facetValueIds = filters?.value.facetValueIds ?? [];
        return shopApi(CatalogProductsDocument, {
            term,
            take: pageSize,
            skip,
            collectionSlug: collectionSlug?.value,
            facetValueFilters: buildFacetValueFilters(facetValueIds, facetGroups.value),
            inStock: filters?.value.inStock ? true : undefined,
            priceRangeWithTax: buildPriceRange(),
            sort: buildSort(sortKey.value),
        });
    }

    async function fetchFacets(): Promise<CatalogFacetsQuery> {
        const term = query?.value || undefined;
        return shopApi(CatalogFacetsDocument, {
            term,
            collectionSlug: collectionSlug?.value,
            inStock: filters?.value.inStock ? true : undefined,
            priceRangeWithTax: buildPriceRange(),
        });
    }

    function clearResults(failed: boolean): void {
        loadError.value = failed;
        loading.value = false;
        [items.value, facetGroups.value, categoryCounts.value] = [[], [], new Map()];
        [totalItems.value, hasMore.value, categoryCountsLoading.value] = [0, false, false];
    }

    let loadSeq = 0;
    let countsTerm: string | undefined;

    async function load(): Promise<void> {
        const seq = ++loadSeq;
        loading.value = true;
        const term = query?.value || undefined;
        if (term && term !== countsTerm) categoryCountsLoading.value = true;
        await capabilitiesReady;
        let productsResult: CatalogProductsQuery;
        let facetsResult: CatalogFacetsQuery | null;
        try {
            if (collectionSlug?.value && !(await isCollectionVisible(collectionSlug.value))) {
                if (seq === loadSeq) clearResults(false);
                return;
            }
            [productsResult, facetsResult] = await Promise.all([
                fetchProducts(0),
                fetchFacets().catch(() => null),
            ]);
        } catch (e) {
            if (seq === loadSeq) {
                console.error('Catalog load failed', e);
                loadErrorInfo.value = describeLoadError(e);
                clearResults(true);
            }
            throw e;
        }
        if (seq !== loadSeq) return;
        loadError.value = false;

        const facetValues = facetsResult?.search.facetValues ?? productsResult.search.facetValues;
        facetGroups.value = orderFacetGroups(buildFacetGroups(facetValues));
        categoryCounts.value = new Map(
            (facetsResult?.search.collections ?? []).map(c => [c.collection.slug, c.count]),
        );
        items.value = mapItems(productsResult.search.items, facetValues);
        totalItems.value = productsResult.search.totalItems;
        currentSkip = productsResult.search.items.length;
        hasMore.value =
            productsResult.search.items.length === pageSize &&
            currentSkip < productsResult.search.totalItems;
        countsTerm = term;
        categoryCountsLoading.value = false;
        loading.value = false;
    }

    async function loadMore(): Promise<void> {
        // While load() is in flight, currentSkip/hasMore are stale; appending would duplicate rows.
        // The IntersectionObserver sentinel can fire before the first load() response lands.
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

    // Several triggers in one tick (query + collection + filters reset) must issue one request.
    let loadScheduled = false;
    function scheduleLoad(): void {
        if (loadScheduled) return;
        loadScheduled = true;
        queueMicrotask(() => {
            loadScheduled = false;
            load().catch(() => undefined); // load() already records the error state
        });
    }

    if (query) watch(query, scheduleLoad);
    if (collectionSlug) watch(collectionSlug, scheduleLoad);
    if (filters) watch(filters, scheduleLoad, { deep: true });
    watch(sortKey, scheduleLoad);

    return {
        items,
        facetGroups,
        categoryCounts,
        categoryCountsLoading,
        totalItems,
        loading,
        loadError,
        loadErrorInfo,
        loadingMore,
        hasMore,
        viewMode,
        setViewMode,
        sortKey,
        sortOptions,
        priceRangeSupported,
        loadMore,
        load,
    };
}
