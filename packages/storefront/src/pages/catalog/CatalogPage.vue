<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { useProductList, type FilterState } from '../../composables/useProductList';
import { MvCatalogFacets } from '@mivend/ui-kit';
import ProductListView from '../../components/ProductListView.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

function parseFiltersFromQuery(): FilterState {
    const facetValueIds = route.query.fv
        ? String(route.query.fv).split(',').filter(Boolean)
        : [];
    return {
        facetValueIds,
        inStock: route.query.inStock === '1',
        priceMin: route.query.priceMin ? Number(route.query.priceMin) : null,
        priceMax: route.query.priceMax ? Number(route.query.priceMax) : null,
    };
}

const searchQuery = ref((route.query.q as string) ?? '');
const pendingCategoryCode = ref<string | undefined>(
    collectionSlugToCategoryCode((route.query.collection as string) || undefined),
);
const filters = ref<FilterState>(parseFiltersFromQuery());

const { items, facetGroups, totalItems, loading, loadingMore, hasMore, viewMode, setViewMode, sortKey, load, loadMore } =
    useProductList({ pageSize: 24, query: searchQuery, filters });

// Sync filter state → URL (replace so back button works correctly)
let syncingFromUrl = false;
watch(filters, f => {
    if (syncingFromUrl) return;
    router.replace({
        query: {
            ...route.query,
            fv: f.facetValueIds.length ? f.facetValueIds.join(',') : undefined,
            inStock: f.inStock ? '1' : undefined,
            priceMin: f.priceMin ?? undefined,
            priceMax: f.priceMax ?? undefined,
        },
    });
}, { deep: true });

function collectionSlugToCategoryCode(slug: string | undefined): string | undefined {
    if (!slug) return undefined;
    // "cat-cat-engine-oils" → "cat-engine-oils"  (strip leading "cat-")
    return slug.startsWith('cat-') ? slug.slice(4) : slug;
}

function applyPendingCategory(): void {
    const code = pendingCategoryCode.value;
    if (!code) return;
    const catGroup = facetGroups.value.find(g => g.code === 'category');
    const val = catGroup?.values.find(v => v.code === code);
    if (val) {
        filters.value = { ...filters.value, facetValueIds: [val.id] };
        pendingCategoryCode.value = undefined;
    }
}

watch(facetGroups, applyPendingCategory);

function toggleFacetValue(id: string): void {
    const ids = filters.value.facetValueIds;
    filters.value = {
        ...filters.value,
        facetValueIds: ids.includes(id) ? ids.filter(v => v !== id) : [...ids, id],
    };
}

function resetFilters(): void {
    pendingCategoryCode.value = undefined;
    filters.value = { facetValueIds: [], inStock: false, priceMin: null, priceMax: null };
}

const selectedFacetValues = computed(() => new Set(filters.value.facetValueIds));

watch(() => route.query.q, q => {
    searchQuery.value = (q as string) ?? '';
    pendingCategoryCode.value = undefined;
    resetFilters();
});

watch(() => route.query.collection, slug => {
    pendingCategoryCode.value = collectionSlugToCategoryCode((slug as string) || undefined);
    searchQuery.value = '';
    resetFilters();
});

// Restore filters when navigating back via browser history
watch(() => route.query.fv, () => {
    syncingFromUrl = true;
    filters.value = parseFiltersFromQuery();
    syncingFromUrl = false;
});

onMounted(load);
</script>

<template>
    <main class="catalog-page">
        <div class="catalog-page__inner">
            <MvCatalogFacets
                :facet-groups="facetGroups"
                :in-stock-only="filters.inStock"
                :selected-facet-values="selectedFacetValues"
                :price-min="filters.priceMin"
                :price-max="filters.priceMax"
                @update:in-stock-only="filters = { ...filters, inStock: $event }"
                @toggle-facet-value="toggleFacetValue"
                @update:price-min="filters = { ...filters, priceMin: $event }"
                @update:price-max="filters = { ...filters, priceMax: $event }"
                @reset="resetFilters"
            />

            <ProductListView
                :items="items"
                :total-items="totalItems"
                :loading="loading"
                :loading-more="loadingMore"
                :has-more="hasMore"
                :view-mode="viewMode"
                :sort-key="sortKey"
                :title="searchQuery ? `Search: &quot;${searchQuery}&quot;` : 'Product catalog'"
                :show-prices="authStore.isLoggedIn"
                @update:view-mode="setViewMode($event)"
                @update:sort-key="sortKey = $event"
                @load-more="loadMore"
            />
        </div>
    </main>
</template>

<style scoped>
.catalog-page {
    max-width: 1440px;
    margin: 0 auto;
    padding: 24px 28px 56px;
}

.catalog-page__inner {
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
    gap: 22px;
    align-items: start;
}

@media (max-width: 960px) {
    .catalog-page__inner { grid-template-columns: 1fr; }
}

@media (max-width: 640px) {
    .catalog-page { padding-left: 16px; padding-right: 16px; }
}
</style>
