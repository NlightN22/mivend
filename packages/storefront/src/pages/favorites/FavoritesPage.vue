<script setup lang="ts">
import { stockVariantFromLevel, useUrlState } from '@mivend/ui-kit';
import { computed, toRef } from 'vue';
import ProductListView from '../../components/ProductListView.vue';
import { useAuthStore } from '../../stores/auth';
import { useFavoritesStore } from '../../stores/favorites';
import { useFavoriteProducts } from '../../composables/useFavoriteProducts';
import { useCartActions } from '../../composables/useCartActions';
import { useViewMode } from '../../composables/useViewMode';
import AccountSidebar from '../account/AccountSidebar.vue';

const authStore = useAuthStore();
const favoritesStore = useFavoritesStore();
const { products, loading, error } = useFavoriteProducts();
const { viewMode, setViewMode } = useViewMode();
const { addToCart } = useCartActions();

const { filters: urlState } = useUrlState({ q: '', inStock: '' }, { typingKeys: ['q'] });
const search = toRef(urlState, 'q');
const inStockOnly = computed({
    get: () => urlState.inStock === '1',
    set: (value: boolean) => {
        urlState.inStock = value ? '1' : '';
    },
});

const isAvailable = (stockLevel: string): boolean => stockVariantFromLevel(stockLevel) !== 'out';

const shown = computed(() => {
    const q = search.value.trim().toLowerCase();
    return products.value.filter(p => {
        const v = p.variants[0];
        if (inStockOnly.value && !isAvailable(v?.stockLevel ?? '')) return false;
        if (!q) return true;
        return [p.name, v?.sku ?? '', p.manufacturer?.name ?? ''].some(t =>
            t.toLowerCase().includes(q),
        );
    });
});

const availableCount = computed(
    () => shown.value.filter(p => isAvailable(p.variants[0]?.stockLevel ?? '')).length,
);

async function handleAddAll(): Promise<void> {
    for (const p of shown.value) {
        const v = p.variants[0];
        if (!v || !isAvailable(v.stockLevel)) continue;
        await addToCart(v.id, v);
    }
}

function handleClearUnavailable(): void {
    for (const p of products.value) {
        const v = p.variants[0];
        if (v && !isAvailable(v.stockLevel)) favoritesStore.remove(v.id);
    }
}
</script>

<template>
    <div class="favorites-page">
        <AccountSidebar />

        <section class="favorites-page__content">
            <div class="favorites-page__head">
                <div>
                    <h1 class="favorites-page__title">{{ $t('favorites.title') }}</h1>
                    <p class="favorites-page__subtitle">
                        {{ $t('favorites.subtitle') }}
                    </p>
                </div>
                <div class="favorites-page__head-actions">
                    <MvButton variant="secondary" @click="handleClearUnavailable">
                        {{ $t('favorites.clearUnavailable') }}
                    </MvButton>
                    <MvButton @click="handleAddAll">
                        {{ $t('favorites.addAvailable', { n: availableCount }) }}
                    </MvButton>
                </div>
            </div>

            <div v-if="favoritesStore.items.length === 0" class="favorites-page__empty">
                <p>{{ $t('favorites.empty') }}</p>
            </div>

            <template v-else>
                <div class="favorites-page__search">
                    <MvSearchInput
                        v-model="search"
                        :placeholder="$t('favorites.search')"
                        :button-label="$t('search.button')"
                        :open-search-label="$t('search.open')"
                        :clear-label="$t('search.clear')"
                    />
                    <MvCheckbox v-model="inStockOnly" :label="$t('catalogFilters.inStock')" />
                </div>
                <ProductListView
                    :items="shown"
                    :total-items="shown.length"
                    :loading="loading"
                    :load-error="error"
                    :loading-more="false"
                    :has-more="false"
                    :view-mode="viewMode"
                    :sort-key="'added'"
                    :sort-options="[{ value: 'added', label: $t('sort.recentlyAdded') }]"
                    :show-prices="authStore.isLoggedIn"
                    @update:view-mode="setViewMode($event)"
                />
            </template>
        </section>
    </div>
</template>

<style scoped>
.favorites-page {
    display: grid;
    grid-template-columns: 250px minmax(0, 1fr);
    gap: 24px;
    align-items: start;
    max-width: 1440px;
    margin: 0 auto;
    padding: 24px 28px 56px;
}

.favorites-page__content {
    min-width: 0;
}

.favorites-page__head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 18px;
}

.favorites-page__title {
    margin: 0 0 6px;
    font-size: clamp(34px, 3.6vw, 50px);
    line-height: 0.98;
    letter-spacing: -0.055em;
}

.favorites-page__subtitle {
    margin: 0;
    color: #66736e;
    font-size: 14px;
    line-height: 1.45;
}

.favorites-page__head-actions {
    display: flex;
    gap: 9px;
    flex-wrap: wrap;
    justify-content: flex-end;
}

.favorites-page__search {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 14px;
}

.favorites-page__empty {
    padding: 48px 0;
    text-align: center;
    color: #66736e;
    font-size: 15px;
}

@media (max-width: 900px) {
    .favorites-page {
        grid-template-columns: 1fr;
        padding: 16px;
    }
    .favorites-page__head {
        flex-direction: column;
        align-items: flex-start;
    }
}
</style>
