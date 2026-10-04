import { ref, type Ref } from 'vue';
import { useLatestRequest } from '@mivend/ui-kit';
import {
    fetchCatalogPage,
    fetchStockForVariants,
    fetchPriceEntriesForVariants,
    type CatalogFilters,
    type CatalogListItem,
} from '../api/catalog';
import { FLOOR_PRICE_TYPE_CODE } from '../constants/pricing';
import type { FacetGroup } from 'shared';

const PAGE_SIZE = 20;

interface PricesAndStock {
    stockMap: Map<string, number>;
    floorMap: Map<string, number> | null;
    priceMaps: (Map<string, number> | null)[];
}

interface CatalogRows {
    page: Awaited<ReturnType<typeof fetchCatalogPage>>;
    prices: PricesAndStock;
}

interface ExtraPriceColumn {
    priceTypeCode: string;
    label: string;
    prices: Map<string, number>;
}

export function useCatalogRows(
    filters: CatalogFilters,
    page: Ref<number>,
    collection: Ref<string | undefined>,
    facetGroups: Ref<FacetGroup[]>,
    priceTypeCodes: Ref<string[]>,
): {
    items: Ref<CatalogListItem[]>;
    totalItems: Ref<number>;
    stock: Ref<Map<string, number>>;
    basePrices: Ref<Map<string, number>>;
    extraPriceColumns: Ref<ExtraPriceColumn[]>;
    floorPrices: Ref<Map<string, number> | null>;
    loading: Ref<boolean>;
    loadPage: () => Promise<void>;
} {
    const items = ref<CatalogListItem[]>([]);
    const totalItems = ref(0);
    const stock = ref<Map<string, number>>(new Map());
    // First price type is shown directly on each MvProductRow ("base" price); any further ones
    // (rare — currently only WHOLESALE is seeded) are manager-only extras, same as floor price.
    const basePrices = ref<Map<string, number>>(new Map());
    const extraPriceColumns = ref<ExtraPriceColumn[]>([]);
    const floorPrices = ref<Map<string, number> | null>(null);

    async function fetchPricesAndStock(rows: CatalogListItem[]): Promise<PricesAndStock> {
        const variantIds = rows.map(r => r.productVariantId);
        const [stockMap, floorMap, ...priceMaps] = await Promise.all([
            fetchStockForVariants(variantIds),
            fetchPriceEntriesForVariants(variantIds, FLOOR_PRICE_TYPE_CODE),
            ...priceTypeCodes.value.map(code => fetchPriceEntriesForVariants(variantIds, code)),
        ]);
        return { stockMap, floorMap, priceMaps };
    }

    async function fetchRows(): Promise<CatalogRows> {
        const result = await fetchCatalogPage(
            filters,
            facetGroups.value,
            page.value,
            PAGE_SIZE,
            collection.value,
        );
        return { page: result, prices: await fetchPricesAndStock(result.items) };
    }

    function applyResult({ page: result, prices }: CatalogRows): void {
        items.value = result.items;
        totalItems.value = result.totalItems;
        stock.value = prices.stockMap;
        floorPrices.value = prices.floorMap;
        const [baseCode, ...restCodes] = priceTypeCodes.value;
        basePrices.value = baseCode ? (prices.priceMaps[0] ?? new Map()) : new Map();
        extraPriceColumns.value = restCodes.map((code, i) => ({
            priceTypeCode: code,
            label: `${code[0]}${code.slice(1).toLowerCase()}`,
            prices: prices.priceMaps[i + 1] ?? new Map(),
        }));
    }

    const { loading, run } = useLatestRequest(fetchRows, applyResult);
    return {
        items,
        totalItems,
        stock,
        basePrices,
        extraPriceColumns,
        floorPrices,
        loading,
        loadPage: run,
    };
}
