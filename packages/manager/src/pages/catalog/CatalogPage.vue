<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { MvPanel, MvPagination } from '@mivend/ui-kit';
import {
    DEFAULT_CATALOG_FILTERS,
    fetchCatalogFacets,
    fetchCatalogPage,
    fetchStockForVariants,
    fetchPriceEntriesForVariants,
    type CatalogFilters,
    type CatalogFacets,
    type CatalogListItem,
} from '../../api/catalog';
import { fetchPriceTypeCodes } from '../../api/discounts';
import { FLOOR_PRICE_TYPE_CODE } from '../../constants/pricing';
import CatalogFilterBar from '../../components/catalog/CatalogFilterBar.vue';
import CatalogTable from '../../components/catalog/CatalogTable.vue';

const filters = reactive<CatalogFilters>({ ...DEFAULT_CATALOG_FILTERS });
const page = ref(1);
const pageSize = 20;

const items = ref<CatalogListItem[]>([]);
const totalItems = ref(0);
const facets = ref<CatalogFacets>({ categories: [], brands: [] });
const priceTypeCodes = ref<string[]>([]);
const stock = ref<Map<string, number>>(new Map());
const priceColumns = ref<{ priceTypeCode: string; label: string; prices: Map<string, number> }[]>(
    [],
);
const floorPrices = ref<Map<string, number> | null>(null);
const loading = ref(true);

async function loadPricesAndStock(rows: CatalogListItem[]): Promise<void> {
    const variantIds = rows.map(r => r.productVariantId);
    const [stockMap, floorMap, ...priceMaps] = await Promise.all([
        fetchStockForVariants(variantIds),
        fetchPriceEntriesForVariants(variantIds, FLOOR_PRICE_TYPE_CODE),
        ...priceTypeCodes.value.map(code => fetchPriceEntriesForVariants(variantIds, code)),
    ]);
    stock.value = stockMap;
    floorPrices.value = floorMap;
    priceColumns.value = priceTypeCodes.value.map((code, i) => ({
        priceTypeCode: code,
        label: `${code[0]}${code.slice(1).toLowerCase()} price`,
        prices: priceMaps[i] ?? new Map(),
    }));
}

async function loadPage(): Promise<void> {
    const result = await fetchCatalogPage(filters, page.value, pageSize);
    items.value = result.items;
    totalItems.value = result.totalItems;
    await loadPricesAndStock(result.items);
}

function resetFilters(): void {
    Object.assign(filters, DEFAULT_CATALOG_FILTERS);
    page.value = 1;
}

watch(page, () => loadPage());
watch(filters, () => {
    page.value = 1;
    loadPage();
});

async function loadAll(): Promise<void> {
    loading.value = true;
    try {
        [facets.value, priceTypeCodes.value] = await Promise.all([
            fetchCatalogFacets(),
            fetchPriceTypeCodes(),
        ]);
        await loadPage();
    } finally {
        loading.value = false;
    }
}

loadAll();
</script>

<template>
    <div class="catalog-page">
        <div class="catalog-page__header">
            <div class="catalog-page__breadcrumb">Workspace / Catalog</div>
            <h1 class="catalog-page__title">Catalog</h1>
        </div>

        <MvPanel>
            <CatalogFilterBar
                :filters="filters"
                :categories="facets.categories"
                :brands="facets.brands"
                @update:filters="Object.assign(filters, $event)"
                @reset="resetFilters"
            />

            <CatalogTable
                v-if="!loading"
                :items="items"
                :categories="facets.categories"
                :brands="facets.brands"
                :stock="stock"
                :price-columns="priceColumns"
                :floor-prices="floorPrices"
            />
            <MvPagination :page="page" :page-size="pageSize" :total="totalItems" @update:page="page = $event" />
        </MvPanel>
    </div>
</template>

<style scoped>
.catalog-page {
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.catalog-page__breadcrumb {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
    margin-bottom: 6px;
}

.catalog-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}
</style>
