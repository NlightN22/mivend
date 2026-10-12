<script setup lang="ts">
import { MvErrorState, type StockVariant, stockVariantFromLevel } from '@mivend/ui-kit';
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useFavoritesStore } from '../stores/favorites';
import { useCartActions } from '../composables/useCartActions';
import { brandOf } from '../utils/brand';
import type { ProductItem, ViewMode } from '../composables/useProductList';
import { useMultiplicityEnforced } from '../composables/useMultiplicityEnforced';
import { usePackagesOnly } from '../composables/usePackagesOnly';
import { baseToPacks, nextPackAbove, packsToBase, salesUnitOf } from '../composables/useSalesUnit';

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

const authStore = useAuthStore();
const favoritesStore = useFavoritesStore();
const { cartLineFor, onAddToCart, onUpdateQty } = useCartActions();
const { packagesOnly, load: loadPackagesOnly } = usePackagesOnly();
void loadPackagesOnly();
const { multiplicityEnforced, load: loadMultiplicityEnforced } = useMultiplicityEnforced();
void loadMultiplicityEnforced();

// Unit view of a list item: in a packages-only branch prices and quantities are per pack.
function unitView(p: ProductItem): {
    label: string;
    factor: number;
    step: number;
    multiplicity?: string;
    note?: string;
} {
    const v = p.variants[0];
    const unit = salesUnitOf(
        { unitName: v?.unitName, unitRatioToBase: v?.unitRatioToBase },
        packagesOnly.value,
    );
    if (!unit) return { label: 'pc.', factor: 1, step: 1 };
    return {
        label: unit.name,
        factor: unit.ratio,
        step: unit.packStep,
        multiplicity: unit.packStep > 1 ? `${unit.packStep} ${unit.name}` : '—',
        note: `1 ${unit.name} = ${packsToBase(1, unit)} pc.`,
    };
}

// Pieces in the nearest pack (the variant's own pack unit, else the smallest level above 1).
function packQty(p: ProductItem): number | null {
    const v = p.variants[0];
    return (
        nextPackAbove(
            { unitName: v?.unitName, unitRatioToBase: v?.unitRatioToBase },
            v?.packagingLevels ?? [],
            salesUnitOf(
                { unitName: v?.unitName, unitRatioToBase: v?.unitRatioToBase },
                packagesOnly.value,
            )?.ratio ?? 1,
        )?.baseQty ?? null
    );
}

function shownQty(p: ProductItem): number {
    const qty = cartLineFor(p.variants[0]?.id)?.quantity ?? 0;
    const unit = salesUnitOf(
        { unitName: p.variants[0]?.unitName, unitRatioToBase: p.variants[0]?.unitRatioToBase },
        packagesOnly.value,
    );
    return unit ? baseToPacks(qty, unit) : qty;
}

function toBaseQty(p: ProductItem, shown: number): number {
    const unit = salesUnitOf(
        { unitName: p.variants[0]?.unitName, unitRatioToBase: p.variants[0]?.unitRatioToBase },
        packagesOnly.value,
    );
    return unit ? packsToBase(shown, unit) : shown;
}

function addQty(p: ProductItem): number {
    return toBaseQty(p, unitView(p).step);
}
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

function stockProps(stockLevel: string): { stockVariant?: StockVariant } {
    if (!authStore.isLoggedIn) return {};
    return { stockVariant: stockVariantFromLevel(stockLevel) };
}

function handleToggleFavorite(p: ProductItem): void {
    favoritesStore.toggle(p.variants[0]?.id ?? p.id, p.id);
}
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
                <MvProductRow
                    v-for="p in items"
                    :key="p.id"
                    :image-url="p.images[0]"
                    :name="p.name"
                    :sku="p.variants[0]?.sku ?? ''"
                    :brand="brandOf(p.manufacturer)"
                    :price="
                        p.variants[0]?.price != null
                            ? Math.round(p.variants[0].price * unitView(p).factor) / 100
                            : undefined
                    "
                    :customer-price="
                        p.variants[0]?.customerPrice != null
                            ? Math.round(p.variants[0].customerPrice * unitView(p).factor) / 100
                            : undefined
                    "
                    :old-price="
                        p.variants[0]?.compareAtPrice != null
                            ? Math.round(p.variants[0].compareAtPrice * unitView(p).factor) / 100
                            : undefined
                    "
                    :unit-label="unitView(p).label"
                    :unit-note="unitView(p).note"
                    :multiplicity="p.variants[0]?.multiplicity ?? 1"
                    :multiplicity-label="unitView(p).multiplicity"
                    :show-multiplicity="multiplicityEnforced"
                    :pack-label="
                        multiplicityEnforced ? undefined : packQty(p) ? `${packQty(p)} pcs` : '—'
                    "
                    :qty-step="unitView(p).step"
                    :discount-tiers="p.variants[0]?.discountTiers"
                    :currency="p.variants[0]?.currencyCode ?? 'RUB'"
                    :slug="p.slug"
                    :show-prices="showPrices"
                    :variant-id="p.variants[0]?.id"
                    :cart-qty="shownQty(p)"
                    :cart-line-id="cartLineFor(p.variants[0]?.id)?.id"
                    :is-favorited="favoritesStore.has(p.variants[0]?.id ?? '')"
                    v-bind="stockProps(p.variants[0]?.stockLevel ?? '')"
                    @add-to-cart="
                        (variantId: string | undefined) => onAddToCart(variantId, addQty(p))
                    "
                    @update-cart-qty="
                        (lineId: string, qty: number) => onUpdateQty(lineId, toBaseQty(p, qty))
                    "
                    @toggle-favorite="() => handleToggleFavorite(p)"
                    @view-analogs="() => {}"
                />
            </div>
        </template>

        <template v-else>
            <div class="plv-grid" :style="{ gridTemplateColumns: gridStyle }">
                <MvProductCard
                    v-for="p in items"
                    :key="p.id"
                    :images="p.images"
                    :name="p.name"
                    :sku="p.variants[0]?.sku ?? ''"
                    :brand="brandOf(p.manufacturer)"
                    :price="
                        p.variants[0]?.price != null
                            ? Math.round(p.variants[0].price * unitView(p).factor) / 100
                            : undefined
                    "
                    :customer-price="
                        p.variants[0]?.customerPrice != null
                            ? Math.round(p.variants[0].customerPrice * unitView(p).factor) / 100
                            : undefined
                    "
                    :compare-at-price="
                        p.variants[0]?.compareAtPrice != null
                            ? Math.round(p.variants[0].compareAtPrice * unitView(p).factor) / 100
                            : undefined
                    "
                    :unit-label="unitView(p).label"
                    :unit-note="unitView(p).note"
                    :pack-label="packQty(p) ? `pack of ${packQty(p)}` : ''"
                    :qty-step="unitView(p).step"
                    :discount-tiers="p.variants[0]?.discountTiers"
                    :currency="p.variants[0]?.currencyCode ?? 'RUB'"
                    :slug="p.slug"
                    :show-prices="showPrices"
                    :variant-id="p.variants[0]?.id"
                    :cart-qty="shownQty(p)"
                    :cart-line-id="cartLineFor(p.variants[0]?.id)?.id"
                    :is-favorited="favoritesStore.has(p.variants[0]?.id ?? '')"
                    v-bind="stockProps(p.variants[0]?.stockLevel ?? '')"
                    @add-to-cart="
                        (variantId: string | undefined) => onAddToCart(variantId, addQty(p))
                    "
                    @update-cart-qty="
                        (lineId: string, qty: number) => onUpdateQty(lineId, toBaseQty(p, qty))
                    "
                    @toggle-favorite="() => handleToggleFavorite(p)"
                    @view-analogs="() => {}"
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
