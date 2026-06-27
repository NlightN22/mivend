<script setup lang="ts">
import { onMounted } from 'vue';
import { useAuthStore } from '../../stores/auth';
import { useCartStore } from '../../stores/cart';
import { useProductList } from '../../composables/useProductList';
import ProductListView from '../../components/ProductListView.vue';

const authStore = useAuthStore();
const cartStore = useCartStore();
const { items, loading, loadingMore, hasMore, viewMode, sortKey, load, loadMore } = useProductList({ pageSize: 24 });

onMounted(load);
</script>

<template>
    <main class="home-page">
        <div class="home-page__inner">
            <div class="home-page__header">
                <h2 class="home-page__title">Popular products</h2>
                <p class="home-page__subtitle">
                    {{ authStore.isLoggedIn
                        ? 'Current stock and prices for your trading point'
                        : 'Log in to see prices and stock' }}
                </p>
            </div>
            <ProductListView
                :items="items"
                :loading="loading"
                :loading-more="loadingMore"
                :has-more="hasMore"
                :view-mode="viewMode"
                :sort-key="sortKey"
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
.home-page {
    max-width: 1440px;
    margin: 0 auto;
    padding: 24px 28px 56px;
}

.home-page__header { margin-bottom: 4px; }

.home-page__title {
    margin: 0 0 6px;
    font-size: 24px;
    font-weight: 900;
    letter-spacing: -0.04em;
    color: #14231f;
}

.home-page__subtitle {
    margin: 0 0 18px;
    color: #66736e;
    font-size: 14px;
}

@media (max-width: 640px) {
    .home-page { padding-left: 16px; padding-right: 16px; }
}
</style>
