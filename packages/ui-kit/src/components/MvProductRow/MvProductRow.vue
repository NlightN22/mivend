<script setup lang="ts">
import { computed } from 'vue';
import MvAmountDisplay from '../MvAmountDisplay/MvAmountDisplay.vue';
import MvStockBadge from '../MvStockBadge/MvStockBadge.vue';
import MvQtyStepper from '../MvQtyStepper/MvQtyStepper.vue';
import MvFavoriteButton from '../MvFavoriteButton/MvFavoriteButton.vue';
import MvDiscountBadge, { type DiscountTier } from '../MvDiscountBadge/MvDiscountBadge.vue';

interface Props {
  name: string;
  sku: string;
  brand?: string;
  price?: number;
  customerPrice?: number;
  oldPrice?: number;
  discountTiers?: DiscountTier[];
  discountTitle?: string;
  currency?: string;
  stock?: number;
  stockVariant?: 'ok' | 'low' | 'out';
  multiplicity?: number;
  slug?: string;
  showPrices?: boolean;
  variantId?: string;
  cartQty?: number;
  cartLineId?: string;
  isFavorited?: boolean;
  linkBase?: string;
  showFavorite?: boolean;
  // Suppresses the qty stepper/"+ Add"/"Analogs" action area entirely — for a view-only,
  // no-cart consumer (e.g. an internal staff catalog lookup).
  showActions?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  brand: '',
  price: undefined,
  customerPrice: undefined,
  oldPrice: undefined,
  discountTiers: () => [],
  currency: 'RUB',
  stock: undefined,
  stockVariant: undefined,
  multiplicity: 1,
  slug: '',
  showPrices: true,
  variantId: undefined,
  cartQty: 0,
  cartLineId: undefined,
  isFavorited: false,
  linkBase: '/product',
  showFavorite: true,
  showActions: true,
});

const emit = defineEmits<{
  'add-to-cart': [variantId: string | undefined];
  'update-cart-qty': [lineId: string, qty: number];
  'toggle-favorite': [variantId: string | undefined];
  'view-analogs': [];
}>();

const effectiveStockVariant = computed((): 'ok' | 'low' | 'out' => {
  if (props.stock !== undefined) {
    if (props.stock === 0) return 'out';
    if (props.stock < 10) return 'low';
    return 'ok';
  }
  return props.stockVariant ?? 'out';
});

const canOrder = computed(() => effectiveStockVariant.value !== 'out');

function onStepperChange(qty: number): void {
  if (props.cartLineId) emit('update-cart-qty', props.cartLineId, qty);
}
</script>

<template>
  <article class="mv-product-row">
    <div class="mv-product-row__media">
      <div class="mv-product-row__img-wrap">
        <slot name="image"><div class="mv-product-row__img-placeholder">&#9744;</div></slot>
      </div>
    </div>

    <div class="mv-product-row__main">
      <RouterLink v-if="slug" :to="`${linkBase}/${slug}`" class="mv-product-row__name">{{ name }}</RouterLink>
      <span v-else class="mv-product-row__name mv-product-row__name--plain">{{ name }}</span>
      <div class="mv-product-row__brand-row">
        <span v-if="brand" class="mv-product-row__brand">{{ brand }}</span>
        <MvDiscountBadge v-if="discountTiers.length > 0" size="sm" :tiers="discountTiers" :title="discountTitle" />
      </div>
    </div>

    <div class="mv-product-row__cell">
      <div class="mv-product-row__cell-label">SKU</div>
      <div class="mv-product-row__cell-value mv-product-row__sku">{{ sku }}</div>
    </div>

    <div class="mv-product-row__cell">
      <div class="mv-product-row__cell-label">Stock</div>
      <MvStockBadge v-if="stock !== undefined" :quantity="stock" />
      <MvStockBadge v-else-if="stockVariant" :variant="stockVariant" />
      <span v-else class="mv-product-row__stock-none">—</span>
    </div>

    <div class="mv-product-row__cell">
      <div class="mv-product-row__cell-label">Multiplicity</div>
      <div class="mv-product-row__cell-value">{{ multiplicity }} pcs.</div>
    </div>

    <div class="mv-product-row__cell">
      <div class="mv-product-row__cell-label">Price</div>
      <template v-if="showPrices && (price !== undefined || customerPrice !== undefined)">
        <MvAmountDisplay
          v-if="customerPrice !== undefined"
          :amount="customerPrice"
          :currency="currency"
          size="sm"
          class="mv-product-row__price mv-product-row__price--customer"
        />
        <MvAmountDisplay
          v-if="oldPrice !== undefined"
          :amount="oldPrice"
          :currency="currency"
          size="sm"
          class="mv-product-row__old-price"
        />
        <MvAmountDisplay
          v-if="customerPrice === undefined && price !== undefined"
          :amount="price"
          :currency="currency"
          size="sm"
          class="mv-product-row__price"
        />
      </template>
      <div v-else-if="!showPrices" class="mv-product-row__price-hint">Log in</div>
      <div v-else class="mv-product-row__price-hint">—</div>
    </div>

    <div v-if="showFavorite || showActions" class="mv-product-row__actions">
      <MvFavoriteButton
        v-if="showFavorite"
        class="mv-product-row__fav"
        :is-favorited="isFavorited"
        @toggle="emit('toggle-favorite', variantId)"
      />
      <div v-if="showActions" class="mv-product-row__control">
        <slot name="actions">
          <template v-if="canOrder">
            <MvQtyStepper
              v-if="cartQty > 0"
              :model-value="cartQty"
              :min="0"
              size="sm"
              @update:model-value="onStepperChange"
            />
            <button
              v-else
              class="mv-product-row__add-btn"
              type="button"
              :disabled="!showPrices"
              @click="emit('add-to-cart', variantId)"
            >
              + Add
            </button>
          </template>
          <template v-else>
            <button class="mv-product-row__analog-btn" type="button" @click="emit('view-analogs')">Analogs</button>
          </template>
        </slot>
      </div>
    </div>
  </article>
</template>

<style scoped>
.mv-product-row {
  display: grid;
  grid-template-columns: 64px minmax(160px, 1fr) 120px 100px 90px 110px 140px;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #edf3f0;
  background: #fff;
  transition: background 0.1s;
}
.mv-product-row:hover { background: #f7fbfa; }

.mv-product-row__media { display: flex; align-items: center; justify-content: center; }
.mv-product-row__img-wrap {
  width: 48px; height: 48px; border-radius: 10px; overflow: hidden;
  background: #f4f9f7; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.mv-product-row__img-placeholder { font-size: 22px; color: #b4ccc4; }

.mv-product-row__main { display: flex; flex-direction: column; gap: 3px; padding: 0 12px; min-width: 0; }
.mv-product-row__name {
  font-size: 14px; font-weight: 700; color: #14231f; text-decoration: none;
  line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.mv-product-row__name--plain { cursor: default; }
.mv-product-row__name:not(.mv-product-row__name--plain):hover { color: #00b894; }
.mv-product-row__brand-row { display: flex; align-items: center; gap: 6px; }
.mv-product-row__brand { font-size: 12px; font-weight: 700; color: #66736e; text-transform: uppercase; letter-spacing: 0.04em; }

.mv-product-row__cell { display: flex; flex-direction: column; gap: 2px; padding: 0 8px; }
.mv-product-row__cell-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #a8b8b2; }
.mv-product-row__cell-value { font-size: 13px; color: #2c3b36; }
.mv-product-row__sku { font-family: monospace; font-size: 12px; color: #2c3b36; }
.mv-product-row__stock-none { font-size: 13px; color: #b4ccc4; }

.mv-product-row__price { font-weight: 900; letter-spacing: -0.02em; }
.mv-product-row__price--customer { color: #00a878; }
.mv-product-row__old-price { font-size: 12px !important; color: #a8b8b2; text-decoration: line-through; }
.mv-product-row__price-hint { font-size: 12px; color: #a8b8b2; }

.mv-product-row__actions {
  display: grid;
  grid-template-columns: 28px 1fr;
  align-items: center;
  gap: 8px;
  padding: 0 0 0 8px;
}

.mv-product-row__fav { justify-self: start; }
.mv-product-row__control { display: flex; justify-content: flex-end; }

.mv-product-row__qty {
  display: flex; align-items: center; border: 1.5px solid #dde7e2;
  border-radius: 10px; overflow: hidden; height: 36px;
}
.mv-product-row__qty-btn {
  width: 30px; height: 100%; border: none; background: transparent;
  font-size: 18px; color: #2c3b36; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.1s;
}
.mv-product-row__qty-btn:hover { background: #e8f5f0; }
.mv-product-row__qty-val { min-width: 32px; text-align: center; font-size: 14px; font-weight: 700; color: #14231f; }

.mv-product-row__add-btn {
  height: 36px; padding: 0 14px; border: none; border-radius: 10px;
  background: var(--mv-color-emerald, #00b894); color: #fff; font-size: 13px; font-weight: 700;
  cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;
  transition: background 0.15s; flex-shrink: 0; white-space: nowrap; font-family: inherit;
}
.mv-product-row__add-btn:hover:not(:disabled) { background: #00a07e; }
.mv-product-row__add-btn:disabled { opacity: 0.45; cursor: not-allowed; }

.mv-product-row__analog-btn {
  width: 100%; height: 36px; border: 1.5px solid #dde7e2; border-radius: 10px;
  background: transparent; color: #66736e; font-size: 13px; font-weight: 700; cursor: pointer; transition: border-color 0.15s, color 0.15s;
}
.mv-product-row__analog-btn:hover { border-color: #00b894; color: #00b894; }
</style>
