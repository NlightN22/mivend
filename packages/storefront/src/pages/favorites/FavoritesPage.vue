<script setup lang="ts">
import { ref, computed } from 'vue';
import AccountSidebar from '../account/AccountSidebar.vue';
import FavoritesToolbar from './FavoritesToolbar.vue';
import FavoriteProductCard from './FavoriteProductCard.vue';
import FavoriteProductRow from './FavoriteProductRow.vue';
import type { FavoriteProduct } from './FavoriteProductCard.vue';

const activeGroup = ref('all');
const search = ref('');
const sort = ref('available');
const activeChip = ref('all');
const viewMode = ref<'grid' | 'list'>('grid');

const allProducts: FavoriteProduct[] = [
    {
        id: '1',
        brand: 'Komponent',
        sku: 'KMP-5W40-4L',
        name: 'Engine oil Komponent 5W-40 synthetic 4 L',
        note: 'Added from order #347982. Frequently ordered by this trading point.',
        price: '3 470 ₽',
        stockLabel: '24 pcs.',
        stockVariant: 'ok',
        qty: 2,
        emoji: '🛢️',
    },
    {
        id: '2',
        brand: 'Sakura',
        sku: 'C-1139',
        name: 'Oil filter Sakura C-1139',
        note: 'Suitable for regular service orders. Price is stable.',
        price: '850 ₽',
        stockLabel: '18 pcs.',
        stockVariant: 'ok',
        qty: 5,
        emoji: '🔧',
    },
    {
        id: '3',
        brand: 'Komponent',
        sku: 'AF-G11-10',
        name: 'Antifreeze G11 green 10 kg',
        note: 'Stock is running low. Better to add now or replace with an analog.',
        price: '3 890 ₽',
        stockLabel: '3 pcs.',
        stockVariant: 'low',
        qty: 1,
        emoji: '❄️',
    },
    {
        id: '4',
        brand: 'Lavr',
        sku: 'LN-1741',
        name: 'Brake cleaner Lavr 650 ml',
        note: 'Service consumable. Convenient to add in bulk.',
        price: '310 ₽',
        stockLabel: '96 pcs.',
        stockVariant: 'ok',
        qty: 12,
        emoji: '🧽',
    },
    {
        id: '5',
        brand: 'Bosch',
        sku: 'AR601S',
        name: 'Wiper blades Bosch Aerotwin AR601S',
        note: 'Seasonal item. Price dropped 4% since added.',
        price: '1 680 ₽',
        stockLabel: '12 pcs.',
        stockVariant: 'ok',
        qty: 1,
        emoji: '🛞',
    },
    {
        id: '6',
        brand: 'Trialli',
        sku: 'PF-2412',
        name: 'Front brake pads Trialli PF-2412',
        note: 'Out of stock at current trading point. Can be kept in favorites.',
        price: '2 140 ₽',
        stockLabel: 'None',
        stockVariant: 'none',
        qty: 1,
        emoji: '⚙️',
    },
];

const products = ref(allProducts.map(p => ({ ...p })));

const availableCount = computed(() => products.value.filter(p => p.stockVariant !== 'none').length);

function handleRemove(id: string) {
    const idx = products.value.findIndex(p => p.id === id);
    if (idx !== -1) products.value.splice(idx, 1);
}

function handleQtyChange(id: string, delta: number) {
    const item = products.value.find(p => p.id === id);
    if (item) item.qty = Math.max(1, item.qty + delta);
}

function handleAddAll() {
    // placeholder: add all available to cart
}

function handleClearUnavailable() {
    products.value = products.value.filter(p => p.stockVariant !== 'none');
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

      <div class="favorites-page__main">
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
            @update:view-mode="viewMode = $event"
          />

          <div class="favorites-page__notice">
            <span>ℹ️</span>
            <div>
              <strong>Favorites is not a substitute for reordering.</strong>
              This is where customers keep recurring items — reordering remains an action on a specific order.
            </div>
          </div>

          <div v-if="viewMode === 'grid'" class="favorites-page__grid">
            <FavoriteProductCard
              v-for="product in products"
              :key="product.id"
              :product="product"
              @remove="handleRemove"
              @qty-change="handleQtyChange"
            />
          </div>

          <div v-else class="favorites-page__list">
            <FavoriteProductRow
              v-for="product in products"
              :key="product.id"
              :product="product"
              @add-to-cart="() => {}"
            />
          </div>

          <div class="favorites-page__bulk">
            <div>
              <div class="favorites-page__bulk-title">{{ availableCount }} available items selected</div>
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

.favorites-page__main {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.favorites-page__notice {
  padding: 15px 16px;
  border-radius: 18px;
  border: 1px solid rgba(255, 138, 0, 0.22);
  background: #fff5df;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  color: #573a14;
  font-size: 14px;
  line-height: 1.42;
}

.favorites-page__notice strong {
  display: block;
  color: #33210a;
  margin-bottom: 2px;
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
  .favorites-page__layout { grid-template-columns: 1fr; }
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
