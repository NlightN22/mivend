<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { MvPanel, MvPagination, MvCatalogFacets, MvProductRow } from '@mivend/ui-kit';
import {
    DEFAULT_CATALOG_FILTERS,
    fetchCatalogFacets,
    fetchCatalogPage,
    fetchStockForVariants,
    fetchPriceEntriesForVariants,
    type CatalogFilters,
    type CatalogListItem,
} from '../../api/catalog';
import { fetchPriceTypeCodes } from '../../api/discounts';
import { FLOOR_PRICE_TYPE_CODE } from '../../constants/pricing';
import type { FacetGroup } from 'shared';
import CatalogRowExtras from '../../components/catalog/CatalogRowExtras.vue';

const filters = reactive<CatalogFilters>({ ...DEFAULT_CATALOG_FILTERS });
const page = ref(1);
const pageSize = 20;

const items = ref<CatalogListItem[]>([]);
const totalItems = ref(0);
const facetGroups = ref<FacetGroup[]>([]);
const priceTypeCodes = ref<string[]>([]);
const stock = ref<Map<string, number>>(new Map());
// First price type is shown directly on each MvProductRow ("base" price); any further ones
// (rare — currently only WHOLESALE is seeded) are manager-only extras, same as floor price.
const basePrices = ref<Map<string, number>>(new Map());
const extraPriceColumns = ref<{ priceTypeCode: string; label: string; prices: Map<string, number> }[]>(
    [],
);
const floorPrices = ref<Map<string, number> | null>(null);
const loading = ref(true);

const selectedFacetValues = computed(() => new Set(filters.facetValueIds));

async function loadPricesAndStock(rows: CatalogListItem[]): Promise<void> {
    const variantIds = rows.map(r => r.productVariantId);
    const [stockMap, floorMap, ...priceMaps] = await Promise.all([
        fetchStockForVariants(variantIds),
        fetchPriceEntriesForVariants(variantIds, FLOOR_PRICE_TYPE_CODE),
        ...priceTypeCodes.value.map(code => fetchPriceEntriesForVariants(variantIds, code)),
    ]);
    stock.value = stockMap;
    floorPrices.value = floorMap;
    const [baseCode, ...restCodes] = priceTypeCodes.value;
    basePrices.value = baseCode ? priceMaps[0] ?? new Map() : new Map();
    extraPriceColumns.value = restCodes.map((code, i) => ({
        priceTypeCode: code,
        label: `${code[0]}${code.slice(1).toLowerCase()}`,
        prices: priceMaps[i + 1] ?? new Map(),
    }));
}

async function loadPage(): Promise<void> {
    const result = await fetchCatalogPage(filters, facetGroups.value, page.value, pageSize);
    items.value = result.items;
    totalItems.value = result.totalItems;
    await loadPricesAndStock(result.items);
}

function resetFilters(): void {
    Object.assign(filters, DEFAULT_CATALOG_FILTERS);
    page.value = 1;
}

function toggleFacetValue(id: string): void {
    const next = new Set(filters.facetValueIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    filters.facetValueIds = [...next];
}

watch(page, () => loadPage());
watch(filters, async () => {
    page.value = 1;
    facetGroups.value = await fetchCatalogFacets(filters.search);
    await loadPage();
});

async function loadAll(): Promise<void> {
    loading.value = true;
    try {
        [facetGroups.value, priceTypeCodes.value] = await Promise.all([
            fetchCatalogFacets(''),
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

        <div class="catalog-page__layout">
            <MvCatalogFacets
                :facet-groups="facetGroups"
                :in-stock-only="filters.inStock"
                :selected-facet-values="selectedFacetValues"
                :price-min="filters.priceMin"
                :price-max="filters.priceMax"
                :hidden-facet-codes="[]"
                @update:in-stock-only="filters.inStock = $event"
                @toggle-facet-value="toggleFacetValue"
                @update:price-min="filters.priceMin = $event"
                @update:price-max="filters.priceMax = $event"
                @reset="resetFilters"
            />

            <MvPanel class="catalog-page__results">
                <div v-if="!loading" class="catalog-page__rows">
                    <div v-for="item in items" :key="item.productVariantId" class="catalog-page__row">
                        <MvProductRow
                            :name="item.productName"
                            :sku="item.sku"
                            :slug="item.slug"
                            link-base="/catalog"
                            :stock="stock.get(item.productVariantId)"
                            :price="basePrices.get(item.productVariantId)"
                            currency="USD"
                            :show-favorite="false"
                            :show-actions="false"
                        >
                            <template #image>
                                <img
                                    v-if="item.imagePreview"
                                    :src="item.imagePreview"
                                    :alt="item.productName"
                                    class="catalog-page__row-img"
                                />
                                <div v-else class="catalog-page__row-img-placeholder">&#9744;</div>
                            </template>
                        </MvProductRow>
                        <CatalogRowExtras
                            :variant-id="item.productVariantId"
                            :extra-price-columns="extraPriceColumns"
                            :floor-prices="floorPrices"
                        />
                    </div>
                    <p v-if="!items.length" class="catalog-page__empty">No products match your filters</p>
                </div>
                <MvPagination :page="page" :page-size="pageSize" :total="totalItems" @update:page="page = $event" />
            </MvPanel>
        </div>
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

.catalog-page__layout {
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
    gap: 18px;
    align-items: start;
}

.catalog-page__rows {
    display: flex;
    flex-direction: column;
}

.catalog-page__row-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 10px;
}

.catalog-page__row-img-placeholder {
    font-size: 22px;
    color: #b4ccc4;
}

.catalog-page__empty {
    padding: 24px 16px;
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
}

@media (max-width: 900px) {
    .catalog-page__layout {
        grid-template-columns: 1fr;
    }
}
</style>
