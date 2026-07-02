<script setup lang="ts">
import { computed } from 'vue';
import MvAmountDisplay from '../MvAmountDisplay/MvAmountDisplay.vue';
import MvStockBadge from '../MvStockBadge/MvStockBadge.vue';
import MvQtyStepper from '../MvQtyStepper/MvQtyStepper.vue';
import MvFavoriteButton from '../MvFavoriteButton/MvFavoriteButton.vue';

interface Props {
  name: string;
  sku: string;
  brand?: string;
  price?: number;
  compareAtPrice?: number;
  customerPrice?: number;
  currency?: string;
  stockVariant?: 'ok' | 'low' | 'out';
  stockQuantity?: number;
  slug: string;
  showPrices?: boolean;
  variantId?: string;
  cartQty?: number;
  cartLineId?: string;
  isFavorited?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  brand: '',
  price: undefined,
  compareAtPrice: undefined,
  customerPrice: undefined,
  currency: 'RUB',
  stockVariant: undefined,
  stockQuantity: undefined,
  showPrices: true,
  variantId: undefined,
  cartQty: 0,
  cartLineId: undefined,
  isFavorited: false,
});

const emit = defineEmits<{
  'add-to-cart': [variantId: string | undefined];
  'update-cart-qty': [lineId: string, qty: number];
  'toggle-favorite': [variantId: string | undefined];
  'view-analogs': [variantId: string | undefined];
}>();

const canOrder = computed(() => props.stockVariant !== 'out');
</script>

<template>
  <article class="mv-product-card">
    <a :href="`/product/${slug}`" class="mv-product-card__img-link">
      <div class="mv-product-card__img">
        <span class="mv-product-card__img-icon" aria-hidden="true" />
      </div>
    </a>

    <MvFavoriteButton
      class="mv-product-card__fav"
      :is-favorited="isFavorited"
      @toggle="emit('toggle-favorite', variantId)"
    />

    <div class="mv-product-card__body">
      <div class="mv-product-card__meta">
        <span class="mv-product-card__brand">{{ brand }}</span>
        <span class="mv-product-card__sku">{{ sku }}</span>
      </div>

      <a :href="`/product/${slug}`" class="mv-product-card__name">{{ name }}</a>

      <template v-if="showPrices">
        <div class="mv-product-card__price-row">
          <div class="mv-product-card__prices">
            <MvAmountDisplay
              v-if="customerPrice !== undefined"
              :amount="customerPrice"
              :currency="currency"
              size="md"
              class="mv-product-card__customer-price"
            />
            <MvAmountDisplay
              v-if="price !== undefined"
              :amount="price"
              :currency="currency"
              size="md"
              :class="customerPrice !== undefined ? 'mv-product-card__base-price--strike' : ''"
            />
          </div>
          <MvStockBadge
            v-if="stockQuantity !== undefined"
            :quantity="stockQuantity"
            class="mv-product-card__stock-badge"
          />
          <MvStockBadge
            v-else-if="stockVariant"
            :variant="stockVariant"
            class="mv-product-card__stock-badge"
          />
        </div>
        <template v-if="canOrder">
          <MvQtyStepper
            v-if="cartQty && cartQty > 0"
            :model-value="cartQty"
            :min="0"
            class="mv-product-card__stepper"
            @update:model-value="val => cartLineId && emit('update-cart-qty', cartLineId, val)"
          />
          <button
            v-else
            class="mv-product-card__buy"
            type="button"
            @click="emit('add-to-cart', variantId)"
          >
            Add to cart
          </button>
        </template>
        <button
          v-else
          class="mv-product-card__analogs"
          type="button"
          @click="emit('view-analogs', variantId)"
        >
          View analogs
        </button>
      </template>

      <div v-else class="mv-product-card__guest">
        Log in to see prices
      </div>
    </div>
  </article>
</template>

<style scoped>
.mv-product-card {
  position: relative;
  border: 1px solid #dde7e2;
  border-radius: 20px;
  background: #fff;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}

.mv-product-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 26px rgba(27, 45, 38, 0.1);
}

.mv-product-card__img-link {
  display: block;
  text-decoration: none;
}

.mv-product-card__img {
  height: 138px;
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, #f7fbfa, #ebf8f2);
  border-bottom: 1px solid #edf2ef;
}

.mv-product-card__img-icon {
  display: block;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, #b8e8d8, #d8f4ea);
}

.mv-product-card__fav {
  position: absolute;
  top: 12px;
  right: 12px;
  box-shadow: 0 8px 18px rgba(27, 45, 38, 0.08);
}

.mv-product-card__body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.mv-product-card__meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
  color: #66736e;
}

.mv-product-card__name {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
  color: #17231f;
  text-decoration: none;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 38px;
}

.mv-product-card__name:hover {
  color: var(--el-color-primary, #00b894);
}

.mv-product-card__price-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-top: auto;
}

.mv-product-card__stock-badge { flex-shrink: 0; }

.mv-product-card__prices { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.mv-product-card__customer-price { color: #00a878; font-weight: 900; }
.mv-product-card__base-price--strike { font-size: 12px !important; color: #a8b8b2; text-decoration: line-through; }

.mv-product-card__buy {
  width: 100%;
  height: 40px;
  border: none;
  border-radius: 12px;
  background: var(--app-accent-orange, #ff8a00);
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  transition: background 0.15s;
}

.mv-product-card__buy:hover {
  background: #e67a00;
}

.mv-product-card__stepper {
  width: 100%;
  justify-content: space-between;
}

.mv-product-card__analogs {
  width: 100%;
  height: 40px;
  border: none;
  border-radius: 12px;
  background: #f3f8f6;
  color: #263732;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
}

.mv-product-card__guest {
  font-size: 12px;
  color: #66736e;
  text-align: center;
  padding: 8px 0;
  border-top: 1px solid #edf2ef;
  margin-top: auto;
}
</style>
