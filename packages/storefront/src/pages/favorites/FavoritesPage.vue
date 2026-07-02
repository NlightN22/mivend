<script setup lang="ts">
import { ref, computed } from 'vue';
import { useViewMode } from '../../composables/useViewMode';
import AccountSidebar from '../account/AccountSidebar.vue';
import FavoritesToolbar from './FavoritesToolbar.vue';
import FavoriteProductCard from './FavoriteProductCard.vue';
import FavoriteProductRow from './FavoriteProductRow.vue';
import type { FavoriteProduct } from './FavoriteProductCard.vue';
import { useFavoritesStore } from '../../stores/favorites';
import { useCartStore } from '../../stores/cart';

const favoritesStore = useFavoritesStore();
const cartStore = useCartStore();

const search = ref('');
const sort = ref('available');
const activeGroup = ref('all');
const activeChip = ref('all');
const { viewMode, setViewMode } = useViewMode();

const localQty = ref<Record<string, number>>({});

function getQty(variantId: string): number {
    return localQty.value[variantId] ?? 1;
}

function toCard(item: ReturnType<typeof favoritesStore.items>[number]): FavoriteProduct {
    const priceStr = item.price != null
        ? new Intl.NumberFormat('ru-RU').format(item.price) + ' ' + (item.currency === 'RUB' ? '₽' : item.currency)
        : '—';
    const sv = item.stockVariant;
    const stockVariant: 'ok' | 'low' | 'none' =
        sv === 'ok' ? 'ok' : sv === 'low' ? 'low' : 'none';
    const stockLabel =
        sv === 'ok' ? 'In stock' : sv === 'low' ? 'Low stock' : 'None';
    return {
        id: item.variantId,
        brand: item.brand,
        sku: item.sku,
        name: item.name,
        note: '',
        price: priceStr,
        stockLabel,
        stockVariant,
        qty: getQty(item.variantId),
        emoji: '📦',
    };
}

const filteredCards = computed<FavoriteProduct[]>(() => {
    let items = favoritesStore.items.map(toCard);
    if (search.value.trim()) {
        const q = search.value.toLowerCase();
        items = items.filter(p =>
            p.name.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q) ||
            p.brand.toLowerCase().includes(q)
        );
    }
    if (activeChip.value === 'available') {
        items = items.filter(p => p.stockVariant !== 'none');
    }
    return items;
});

const availableCount = computed(() =>
    filteredCards.value.filter(p => p.stockVariant !== 'none').length
);

function handleRemove(id: string): void {
    favoritesStore.remove(id);
}

function handleQtyChange(id: string, delta: number): void {
    localQty.value[id] = Math.max(1, (localQty.value[id] ?? 1) + delta);
}

async function handleAddAll(): Promise<void> {
    for (const card of filteredCards.value) {
        if (card.stockVariant !== 'none') {
            await cartStore.addItem(card.id, card.qty);
        }
    }
}

function handleClearUnavailable(): void {
    const outIds = favoritesStore.items
        .filter(i => i.stockVariant === 'out' || i.stockVariant == null)
        .map(i => i.variantId);
    outIds.forEach(id => favoritesStore.remove(id));
}
</script>

<template>
  <div class="favorites-page">
    <AccountSidebar />

    <section class="favorites-page__content">
      <div class="favorites-page__head">
        <div>
          <h1 class="favorites-page__title">Favorites</h1>
          <p class="favorites-page__subtitle">Working list of frequently needed items. Quickly add to cart or remove what's no longer needed.</p>
        </div>
        <div class="favorites-page__head-actions">
          <button class="favorites-page__btn" @click="handleClearUnavailable">Clear unavailable</button>
          <button class="favorites-page__btn favorites-page__btn--primary" @click="handleAddAll">Add selected to cart</button>
        </div>
      </div>

      <div v-if="favoritesStore.items.length === 0" class="favorites-page__empty">
        <p>No favorites yet. Click the heart icon on any product to save it here.</p>
      </div>

      <div v-else class="favorites-page__main">
          <FavoritesToolbar
            :search="search"
            :sort="sort"
            :active-group="activeGroup"
            :active-chip="activeChip"
            :view-mode="viewMode"
            @update:search="search = $event"
            @update:sort="sort = $event"
            @update:active-group="activeGroup = $event"
            @update:active-chip="activeChip = $event"
            @update:view-mode="setViewMode($event)"
          />

          <div v-if="viewMode === 'grid'" class="favorites-page__grid">
            <FavoriteProductCard
              v-for="card in filteredCards"
              :key="card.id"
              :product="card"
              @remove="handleRemove"
              @qty-change="handleQtyChange"
            />
          </div>

          <div v-else class="favorites-page__list">
            <FavoriteProductRow
              v-for="card in filteredCards"
              :key="card.id"
              :product="card"
              @add-to-cart="(id, qty) => cartStore.addItem(id, qty)"
            />
          </div>

          <div class="favorites-page__bulk">
            <div>
              <div class="favorites-page__bulk-title">{{ availableCount }} available items</div>
              <div class="favorites-page__bulk-note">You can add them to the cart with the specified quantities. Unavailable items will remain in favorites.</div>
            </div>
            <button class="favorites-page__btn favorites-page__btn--orange" @click="handleAddAll">Add available to cart</button>
          </div>
        </div>
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

.favorites-page__content { min-width: 0; }

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

.favorites-page__btn {
  border: 0;
  min-height: 40px;
  border-radius: 12px;
  padding: 0 14px;
  background: #f3f8f6;
  color: #263732;
  font: inherit;
  font-weight: 950;
  cursor: pointer;
  white-space: nowrap;
}

.favorites-page__btn--primary { background: #00a878; color: #fff; }
.favorites-page__btn--orange { background: #ff8a00; color: #fff; }

.favorites-page__empty {
  padding: 48px 0;
  text-align: center;
  color: #66736e;
  font-size: 15px;
}

.favorites-page__main {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.favorites-page__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.favorites-page__list { display: grid; gap: 8px; }

.favorites-page__bulk {
  background: #fff;
  border: 1px solid rgba(221, 231, 226, 0.86);
  border-radius: 28px;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  padding: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.favorites-page__bulk-title {
  font-weight: 950;
  margin-bottom: 4px;
}

.favorites-page__bulk-note {
  color: #66736e;
  font-size: 13px;
  line-height: 1.35;
}

@media (max-width: 1260px) {
  .favorites-page__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 960px) {
  .favorites-page {
    grid-template-columns: 1fr;
    padding-left: 16px;
    padding-right: 16px;
  }
  .favorites-page__head { display: grid; }
  .favorites-page__head-actions { justify-content: flex-start; }
  .favorites-page__grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (max-width: 640px) {
  .favorites-page__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .favorites-page__bulk { display: grid; }
}
</style>
