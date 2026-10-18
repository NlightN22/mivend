<script setup lang="ts">
import { MvErrorState } from '@mivend/ui-kit';
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import ConnectedProductCard from './ConnectedProductCard.vue';
import type { ProductItem, ViewMode } from '../composables/useProductList';
import { useProductQuantity } from '../composables/useProductQuantity';

const props = defineProps<{
    items: ProductItem[];
    totalItems: number;
    loading: boolean;
    loadError?: boolean;
    errorTitle?: string;
    errorMessage?: string;
    loadingMore: boolean;
    hasMore: boolean;
    viewMode: ViewMode;
    sortKey: string;
    sortOptions: { value: string; label: string }[];
    title?: string;
    showPrices: boolean;
    gridColumns?: number;
}>();

const emit = defineEmits<{
    'update:viewMode': [v: ViewMode];
    'update:sortKey': [v: string];
    loadMore: [];
    retry: [];
}>();

const { multiplicityEnforced } = useProductQuantity();
const sentinel = ref<HTMLElement | null>(null);
const gridStyle = computed(() =>
    props.gridColumns
        ? `repeat(${props.gridColumns}, minmax(0, 1fr))`
        : 'repeat(4, minmax(0, 1fr))',
);
let observer: IntersectionObserver | null = null;

onMounted(() => {
    observer = new IntersectionObserver(
        ([entry]) => {
            if (entry.isIntersecting) emit('loadMore');
        },
        { rootMargin: '200px' },
    );
    if (sentinel.value) observer.observe(sentinel.value);
});

onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
    <div class="plv">
        <div class="plv-toolbar">
            <div>
                <div v-if="title" class="plv-toolbar__title">{{ title }}</div>
                <div class="plv-toolbar__count">
                    {{ loading ? 'Loading...' : `${totalItems} products found` }}
                </div>
            </div>
            <div class="plv-toolbar__right">
                <select
                    class="plv-toolbar__select"
                    :value="sortKey"
                    @change="emit('update:sortKey', ($event.target as HTMLSelectElement).value)"
                >
                    <option v-for="option in sortOptions" :key="option.value" :value="option.value">
                        {{ option.label }}
                    </option>
                </select>
                <div class="plv-toolbar__view">
                    <button
                        :class="[
                            'plv-toolbar__view-btn',
                            { 'plv-toolbar__view-btn--active': viewMode === 'grid' },
                        ]"
                        type="button"
                        @click="emit('update:viewMode', 'grid')"
                    >
                        &#9638; Grid
                    </button>
                    <button
                        :class="[
                            'plv-toolbar__view-btn',
                            { 'plv-toolbar__view-btn--active': viewMode === 'list' },
                        ]"
                        type="button"
                        @click="emit('update:viewMode', 'list')"
                    >
                        &#9783; List
                    </button>
                </div>
            </div>
        </div>

        <div v-if="loading" class="plv-state">Loading products...</div>
        <MvErrorState
            v-else-if="loadError"
            :title="errorTitle ?? 'Could not load products'"
            :message="errorMessage ?? 'Check your connection and try again.'"
            @retry="emit('retry')"
        />
        <div v-else-if="items.length === 0" class="plv-state">No products found</div>

        <template v-else-if="viewMode === 'list'">
            <div class="plv-list">
                <div class="plv-list__header">
                    <span></span><span>Product</span><span>SKU</span> <span>Stock</span
                    ><span>Unit</span
                    ><span>{{ multiplicityEnforced ? 'Multiplicity' : 'Pack' }}</span
                    ><span>Price</span><span>Order</span>
                </div>
                <ConnectedProductCard
                    v-for="p in items"
                    :key="p.id"
                    :item="p"
                    mode="row"
                    :show-prices="showPrices"
                />
            </div>
        </template>

        <template v-else>
            <div class="plv-grid" :style="{ gridTemplateColumns: gridStyle }">
                <ConnectedProductCard
                    v-for="p in items"
                    :key="p.id"
                    :item="p"
                    mode="card"
                    :show-prices="showPrices"
                />
            </div>
        </template>

        <div ref="sentinel" class="plv-sentinel" />
        <div v-if="loadingMore" class="plv-loading-more" role="status">
            <span class="plv-loading-more__spinner" aria-hidden="true" />
            Loading more...
        </div>
    </div>
</template>

<style scoped>
.plv {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.plv-toolbar {
    background: #fff;
    border-radius: 16px;
    border: 1px solid #edf3f0;
    padding: 14px 18px;
    box-shadow: 0 4px 12px rgba(27, 45, 38, 0.05);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    flex-wrap: wrap;
}

.plv-toolbar__title {
    font-size: 18px;
    font-weight: 900;
    letter-spacing: -0.03em;
    color: #14231f;
}
.plv-toolbar__count {
    font-size: 13px;
    color: #66736e;
    margin-top: 2px;
}
.plv-toolbar__right {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
}

.plv-toolbar__select {
    height: 36px;
    padding: 0 10px;
    border: 1.5px solid #dde7e2;
    border-radius: 10px;
    background: #fff;
    font-size: 13px;
    font-family: inherit;
    color: #2c3b36;
    cursor: pointer;
}

.plv-toolbar__view {
    display: flex;
    border: 1.5px solid #dde7e2;
    border-radius: 10px;
    overflow: hidden;
}

.plv-toolbar__view-btn {
    height: 36px;
    padding: 0 12px;
    border: none;
    background: transparent;
    font-size: 13px;
    font-family: inherit;
    color: #66736e;
    cursor: pointer;
    transition:
        background 0.1s,
        color 0.1s;
}

.plv-toolbar__view-btn:hover {
    background: #f4faf7;
}
.plv-toolbar__view-btn--active {
    background: #00b894;
    color: #fff;
}

.plv-list {
    background: #fff;
    border-radius: 16px;
    border: 1px solid #edf3f0;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(27, 45, 38, 0.05);
}

.plv-list__header {
    display: grid;
    grid-template-columns: 64px minmax(160px, 1fr) 120px 100px 80px 90px 110px 140px;
    padding: 10px 16px;
    background: #f7fbfa;
    border-bottom: 2px solid #edf3f0;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #66736e;
}

.plv-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
}

.plv-state {
    padding: 60px;
    text-align: center;
    color: #66736e;
    font-size: 15px;
    background: #fff;
    border-radius: 16px;
    border: 1px solid #edf3f0;
}

.plv-sentinel {
    height: 1px;
}

.plv-loading-more {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 20px;
    color: #66736e;
    font-size: 14px;
}

.plv-loading-more__spinner {
    width: 18px;
    height: 18px;
    border: 2px solid #dde7e2;
    border-top-color: #00b894;
    border-radius: 50%;
    animation: plv-spin 0.7s linear infinite;
}

@keyframes plv-spin {
    to {
        transform: rotate(360deg);
    }
}

@media (prefers-reduced-motion: reduce) {
    .plv-loading-more__spinner {
        animation-duration: 2s;
    }
}

@media (max-width: 1100px) {
    .plv-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    }
}
@media (max-width: 760px) {
    .plv-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }
}
@media (max-width: 480px) {
    .plv-grid {
        grid-template-columns: 1fr !important;
    }
}
</style>
