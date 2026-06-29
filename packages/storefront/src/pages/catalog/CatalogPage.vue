<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { useCartStore } from '../../stores/cart';
import { useProductList, type FilterState } from '../../composables/useProductList';
import CatalogFacets from './CatalogFacets.vue';
import ProductListView from '../../components/ProductListView.vue';

const route = useRoute();
const authStore = useAuthStore();
const cartStore = useCartStore();

const searchQuery = ref((route.query.q as string) ?? '');
const filters = ref<FilterState>({ facetValueIds: [], inStock: false });

const { items, facetGroups, loading, loadingMore, hasMore, viewMode, sortKey, load, loadMore } =
    useProductList({ pageSize: 24, query: searchQuery, filters });

function toggleFacetValue(id: string): void {
    const ids = filters.value.facetValueIds;
    filters.value = {
        ...filters.value,
        facetValueIds: ids.includes(id) ? ids.filter(v => v !== id) : [...ids, id],
    };
}

function resetFilters(): void {
    filters.value = { facetValueIds: [], inStock: false };
}

const selectedFacetValues = computed(() => new Set(filters.value.facetValueIds));

watch(
    () => route.query.q,
    q => {
        searchQuery.value = (q as string) ?? '';
    },
);

onMounted(load);
</script>

<template>
    <main class="catalog-page">
        <div class="catalog-page__inner">
            <CatalogFacets
                :facet-groups="facetGroups"
                :in-stock-only="filters.inStock"
                :selected-facet-values="selectedFacetValues"
                @update:in-stock-only="filters = { ...filters, inStock: $event }"
                @toggle-facet-value="toggleFacetValue"
                @reset="resetFilters"
            />

            <ProductListView
                :items="items"
                :loading="loading"
                :loading-more="loadingMore"
                :has-more="hasMore"
                :view-mode="viewMode"
                :sort-key="sortKey"
                :title="searchQuery ? `Search: &quot;${searchQuery}&quot;` : 'Product catalog'"
                :show-prices="authStore.isLoggedIn"
                @update:view-mode="viewMode = $event"
                @update:sort-key="sortKey = $event"
                @load-more="loadMore"
                @add-to-cart="(variantId, qty) => cartStore.addItem(variantId, qty)"
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
