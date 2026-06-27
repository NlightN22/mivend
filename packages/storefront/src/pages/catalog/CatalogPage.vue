<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { useCartStore } from '../../stores/cart';
import { useProductList } from '../../composables/useProductList';
import CatalogFacets from './CatalogFacets.vue';
import ProductListView from '../../components/ProductListView.vue';

const route = useRoute();
const authStore = useAuthStore();
const cartStore = useCartStore();

const searchQuery = ref((route.query.q as string) ?? '');
const inStockOnly = ref(false);
const selectedFacetValues = ref(new Set<string>());

const { items, loading, loadingMore, hasMore, viewMode, sortKey, load, loadMore, reset } =
    useProductList({ pageSize: 24, query: searchQuery });

const facetGroups = computed(() => {
    const map = new Map<string, { code: string; name: string; values: Map<string, string> }>();
    for (const p of items.value) {
        for (const fv of p.facetValues) {
            if (!map.has(fv.facet.code)) {
                map.set(fv.facet.code, { code: fv.facet.code, name: fv.facet.name, values: new Map() });
            }
            map.get(fv.facet.code)!.values.set(fv.id, fv.name);
        }
    }
    return [...map.values()].map(g => ({
        code: g.code,
        name: g.name,
        values: [...g.values.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    }));
});

const visibleItems = computed(() => {
    let list = items.value;
    if (inStockOnly.value) list = list.filter(p => p.variants[0]?.stockLevel !== 'OUT_OF_STOCK');
    if (selectedFacetValues.value.size > 0) {
        list = list.filter(p => p.facetValues.some(fv => selectedFacetValues.value.has(fv.id)));
    }
    return list;
});

function toggleFacetValue(id: string): void {
    const next = new Set(selectedFacetValues.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedFacetValues.value = next;
}

function resetFilters(): void {
    inStockOnly.value = false;
    selectedFacetValues.value = new Set();
    reset();
}

watch(() => route.query.q, (q) => {
    searchQuery.value = (q as string) ?? '';
});

onMounted(load);
</script>

<template>
    <main class="catalog-page">
        <div class="catalog-page__inner">
            <CatalogFacets
                :facet-groups="facetGroups"
                :in-stock-only="inStockOnly"
                :selected-facet-values="selectedFacetValues"
                @update:in-stock-only="inStockOnly = $event"
                @toggle-facet-value="toggleFacetValue"
                @reset="resetFilters"
            />

            <ProductListView
                :items="visibleItems"
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
