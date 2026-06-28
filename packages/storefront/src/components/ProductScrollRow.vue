<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useCartStore } from '../stores/cart';
import { useFavoritesStore } from '../stores/favorites';
import type { FavoriteItem } from '../stores/favorites';
import type { ProductItem } from '../composables/useProductList';

const props = defineProps<{
    title: string;
    items: ProductItem[];
    loading: boolean;
}>();

const authStore = useAuthStore();
const cartStore = useCartStore();
const favoritesStore = useFavoritesStore();

const CARD_WIDTH = 220;
const CARD_GAP = 14;
const STEP = CARD_WIDTH + CARD_GAP;
const VISIBLE = 5;

const offset = ref(0);

const displayItems = computed(() => {
    if (props.items.length === 0) return [];
    return [...props.items, ...props.items];
});

const maxOffset = computed(() => Math.max(0, props.items.length * STEP));

function prev(): void {
    offset.value = offset.value <= 0 ? maxOffset.value - STEP : offset.value - STEP;
}

function next(): void {
    const n = offset.value + STEP;
    offset.value = n >= maxOffset.value ? 0 : n;
}

function getBrand(p: ProductItem): string {
    return p.facetValues.find(fv => fv.facet.code === 'brand')?.name ?? '';
}

function stockVariantFor(sl: string): 'ok' | 'low' | 'out' {
    if (sl === 'OUT_OF_STOCK') return 'out';
    if (sl === 'LOW_STOCK') return 'low';
    return 'ok';
}

function cartLineFor(variantId: string | undefined) {
    if (!variantId) return null;
    return cartStore.lines.find(l => l.productVariant.id === variantId) ?? null;
}

async function handleCartQty(lineId: string, qty: number): Promise<void> {
    if (qty === 0) {
        await cartStore.removeItem(lineId);
    } else {
        await cartStore.adjustItem(lineId, qty);
    }
}

function buildFavoriteItem(p: ProductItem): FavoriteItem {
    const variant = p.variants[0];
    return {
        variantId: variant?.id ?? p.id,
        productSlug: p.slug,
        name: p.name,
        sku: variant?.sku ?? '',
        brand: getBrand(p),
        price: variant ? variant.price / 100 : undefined,
        currency: variant?.currencyCode ?? 'RUB',
        stockVariant: variant ? stockVariantFor(variant.stockLevel ?? '') : undefined,
        addedAt: 0,
    };
}
</script>

<template>
    <section v-if="loading || items.length > 0" class="psr">
        <h2 class="psr-title">{{ title }}</h2>
        <div v-if="loading" class="psr-state">Loading...</div>
        <div v-else class="psr-wrap">
            <button
                v-if="items.length > VISIBLE"
                class="psr-arrow psr-arrow--left"
                aria-label="Previous"
                @click="prev"
            >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>

            <div class="psr-viewport">
                <div class="psr-track" :style="{ transform: `translateX(-${offset}px)` }">
                    <MvProductCard
                        v-for="(p, i) in displayItems"
                        :key="`${p.id}-${i}`"
                        class="psr-card"
                        :name="p.name"
                        :sku="p.variants[0]?.sku ?? ''"
                        :brand="getBrand(p)"
                        :price="p.variants[0] ? p.variants[0].price / 100 : undefined"
                        :customer-price="p.variants[0]?.customerPrice != null ? p.variants[0].customerPrice / 100 : undefined"
                        :currency="p.variants[0]?.currencyCode ?? 'RUB'"
                        :slug="p.slug"
                        :show-prices="authStore.isLoggedIn"
                        :variant-id="p.variants[0]?.id"
                        :stock-variant="authStore.isLoggedIn ? stockVariantFor(p.variants[0]?.stockLevel ?? '') : undefined"
                        :cart-qty="cartLineFor(p.variants[0]?.id)?.quantity ?? 0"
                        :cart-line-id="cartLineFor(p.variants[0]?.id)?.id"
                        :is-favorited="favoritesStore.has(p.variants[0]?.id ?? '')"
                        @add-to-cart="(variantId) => variantId && cartStore.addItem(variantId, 1)"
                        @update-cart-qty="handleCartQty"
                        @toggle-favorite="() => favoritesStore.toggle(buildFavoriteItem(p))"
                    />
                </div>
            </div>

            <button
                v-if="items.length > VISIBLE"
                class="psr-arrow psr-arrow--right"
                aria-label="Next"
                @click="next"
            >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M7.5 5L12.5 10L7.5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
        </div>
    </section>
</template>

<style scoped>
.psr { margin-bottom: 40px; }

.psr-title {
    margin: 0 0 16px;
    font-size: 20px;
    font-weight: 900;
    letter-spacing: -0.03em;
    color: #14231f;
}

.psr-wrap {
    position: relative;
}

.psr-arrow {
    display: none;
}

@media (hover: hover) and (pointer: fine) {
    .psr-arrow {
        display: flex;
        align-items: center;
        justify-content: center;
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        z-index: 2;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: none;
        background: #fff;
        box-shadow: 0 2px 12px rgba(0,0,0,0.12);
        color: #14231f;
        cursor: pointer;
        transition: background 0.15s, box-shadow 0.15s, color 0.15s;
    }

    .psr-arrow:hover {
        background: #2db87a;
        color: #fff;
        box-shadow: 0 4px 16px rgba(45,184,122,0.35);
    }

    .psr-arrow--left { left: -20px; }
    .psr-arrow--right { right: -20px; }
}

.psr-viewport {
    overflow: hidden;
}

.psr-track {
    display: flex;
    gap: 14px;
    transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    will-change: transform;
}

.psr-card { flex: 0 0 220px; }

.psr-state {
    height: 60px;
    display: flex;
    align-items: center;
    color: #a8b8b2;
    font-size: 14px;
}
</style>
