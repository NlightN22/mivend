<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAuthStore } from '../../stores/auth';

interface Props {
  price?: number;
  compareAtPrice?: number;
  currency?: string;
  stockLevel?: string;
  stock?: number;
  stockQuantity?: number;
  showPrices: boolean;
  productName?: string;
}

const props = withDefaults(defineProps<Props>(), {
  price: undefined,
  compareAtPrice: undefined,
  currency: 'RUB',
  stockLevel: undefined,
  stock: undefined,
  stockQuantity: undefined,
  productName: '',
});

const emit = defineEmits<{ 'add-to-cart': [qty: number] }>();

const authStore = useAuthStore();
const qty = ref(1);

const counterparty = computed(() => authStore.counterparty);
const availableCredit = computed(() => {
  if (!counterparty.value) return null;
  return (counterparty.value.creditLimit - counterparty.value.creditBalance) / 100;
});
const formatRub = (n: number) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n);

const stockVariant = computed((): 'ok' | 'low' | 'out' => {
  if (!props.stockLevel || props.stockLevel === 'OUT_OF_STOCK') return 'out';
  if (props.stockLevel === 'LOW_STOCK') return 'low';
  return 'ok';
});

const stockLabel = computed(() => {
  if (props.stock !== undefined) return `${props.stock} pcs.`;
  if (stockVariant.value === 'out') return 'Out of stock';
  if (stockVariant.value === 'low') return 'Low stock';
  return 'In stock';
});
</script>

<template>
  <div class="buy-panel">
    <div class="buy-panel__card">
      <div class="buy-panel__price-label">
        {{ counterparty?.priceType ? counterparty.priceType + ' price' : 'Customer price' }}
      </div>

      <MvAmountDisplay
        v-if="showPrices && compareAtPrice !== undefined"
        :amount="compareAtPrice"
        :currency="currency ?? 'RUB'"
        size="sm"
        class="buy-panel__compare-at-price"
      />
      <MvAmountDisplay
        v-if="showPrices && price !== undefined"
        :amount="price"
        :currency="currency ?? 'RUB'"
        size="lg"
        class="buy-panel__price"
      />
      <div v-else-if="!showPrices" class="buy-panel__price-hint">Log in to see prices</div>
      <div v-else class="buy-panel__price">—</div>

      <div class="buy-panel__price-note">Price includes customer terms and VAT.</div>

      <div class="buy-panel__info">
        <div class="buy-panel__info-row">
          <span>Stock</span>
          <MvStockBadge v-if="stockQuantity !== undefined" :quantity="stockQuantity" />
          <MvStockBadge v-else :variant="stockVariant" :label="stockLabel" />
        </div>
        <div class="buy-panel__info-row"><span>Warehouse</span><strong>Central warehouse</strong></div>
        <div class="buy-panel__info-row"><span>Dispatch</span><strong>Today</strong></div>
        <div class="buy-panel__info-row"><span>Multiplicity</span><strong>1 pc.</strong></div>
      </div>

      <div class="buy-panel__qty-row">
        <MvQtyStepper v-model="qty" />
        <button class="buy-panel__fav" type="button">♡ Favorites</button>
      </div>

      <button
        class="buy-panel__add"
        type="button"
        :disabled="!showPrices || stockVariant === 'out'"
        @click="emit('add-to-cart', qty)"
      >
        Add to cart
      </button>

      <button class="buy-panel__secondary" type="button" :disabled="!showPrices">
        Buy in 1 click
      </button>
    </div>

    <div v-if="authStore.isLoggedIn && availableCredit !== null && availableCredit > 0"
         class="buy-panel__notice buy-panel__notice--green">
      <span>✓</span>
      <div>
        <strong>Can be ordered without upfront payment.</strong>
        Available credit: {{ formatRub(availableCredit) }}.
        Payment terms: {{ counterparty!.paymentDelayDays }} days.
      </div>
    </div>

    <div class="buy-panel__card buy-panel__delivery">
      <h2 class="buy-panel__delivery-title">Delivery</h2>
      <div class="buy-panel__delivery-sub">To the customer's current trading point.</div>
      <div class="buy-panel__info">
        <div class="buy-panel__info-row">
          <span>Address</span>
          <strong>{{ authStore.tradingPoint?.address ?? 'Not selected' }}</strong>
        </div>
        <div class="buy-panel__info-row"><span>ETA</span><strong>Today by 18:00</strong></div>
        <div class="buy-panel__info-row"><span>Terms</span><strong>Per contract</strong></div>
      </div>
      <p v-if="authStore.tradingPoint?.deliveryComment" class="buy-panel__delivery-comment">
        {{ authStore.tradingPoint.deliveryComment }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.buy-panel { display: flex; flex-direction: column; gap: 12px; }

.buy-panel__card {
  background: #fff;
  border-radius: 20px;
  border: 1px solid rgba(221,231,226,0.86);
  box-shadow: 0 14px 36px rgba(27,45,38,0.08);
  padding: 20px;
}

.buy-panel__price-label { font-size: 12px; color: #a8b8b2; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px; }
.buy-panel__compare-at-price { font-size: 14px !important; color: #a8b8b2; text-decoration: line-through; margin-bottom: 2px; }
.buy-panel__price { display: block; font-size: 32px; font-weight: 900; letter-spacing: -0.04em; color: #14231f; line-height: 1; margin-bottom: 6px; }
.buy-panel__price-hint { font-size: 14px; color: #a8b8b2; margin-bottom: 6px; }
.buy-panel__price-note { font-size: 12px; color: #a8b8b2; margin-bottom: 16px; }

.buy-panel__info { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.buy-panel__info-row { display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
.buy-panel__info-row span { color: #66736e; }
.buy-panel__info-row strong { color: #14231f; font-weight: 700; }

.buy-panel__qty-row { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; }

.buy-panel__fav {
  flex: 1; height: 44px; border: 1.5px solid #dde7e2; border-radius: 12px;
  background: transparent; color: #66736e; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit;
}
.buy-panel__fav:hover { border-color: #e05; color: #e05; }

.buy-panel__add {
  width: 100%; height: 52px; border: none; border-radius: 14px;
  background: #ff8a00; color: #fff; font-size: 16px; font-weight: 800;
  font-family: inherit; cursor: pointer; margin-bottom: 10px; transition: background 0.15s;
}
.buy-panel__add:hover:not(:disabled) { background: #e07a00; }
.buy-panel__add:disabled { opacity: 0.45; cursor: not-allowed; }

.buy-panel__secondary {
  width: 100%; height: 44px; border: 1.5px solid #dde7e2; border-radius: 14px;
  background: transparent; color: #2c3b36; font-size: 14px; font-weight: 700;
  font-family: inherit; cursor: pointer; transition: border-color 0.15s;
}
.buy-panel__secondary:hover:not(:disabled) { border-color: #00b894; color: #00b894; }
.buy-panel__secondary:disabled { opacity: 0.45; cursor: not-allowed; }

.buy-panel__notice {
  border-radius: 16px; padding: 14px 16px; display: flex; gap: 10px;
  align-items: flex-start; font-size: 13px; background: #f0faf6; border: 1px solid #b6e8d4; color: #1a5c40;
}
.buy-panel__notice--green span { font-size: 16px; color: #00a873; flex-shrink: 0; margin-top: 1px; }
.buy-panel__notice strong { display: block; margin-bottom: 2px; }

.buy-panel__delivery { margin-top: 0; }
.buy-panel__delivery-title { font-size: 17px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 4px; }
.buy-panel__delivery-sub { font-size: 13px; color: #66736e; margin-bottom: 14px; }
.buy-panel__delivery-comment { font-size: 12px; color: #66736e; margin: 10px 0 0; font-style: italic; }
</style>
