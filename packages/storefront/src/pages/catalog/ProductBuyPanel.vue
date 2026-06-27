<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAuthStore } from '../../stores/auth';

interface Props {
  price?: number;
  currency?: string;
  stockLevel?: string;
  stock?: number;
  showPrices: boolean;
  productName?: string;
}

const props = withDefaults(defineProps<Props>(), {
  price: undefined,
  currency: 'RUB',
  stockLevel: undefined,
  stock: undefined,
  productName: '',
});

const emit = defineEmits<{ 'add-to-cart': [qty: number] }>();

const authStore = useAuthStore();
const qty = ref(1);

const formattedPrice = computed(() => {
  if (props.price === undefined) return '';
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(props.price);
});

const stockVariant = computed(() => {
  if (!props.stockLevel || props.stockLevel === 'OUT_OF_STOCK') return 'out';
  if (props.stockLevel === 'LOW_STOCK') return 'low';
  return 'ok';
});

const stockText = computed(() => {
  if (props.stock !== undefined) return `${props.stock} шт.`;
  if (stockVariant.value === 'out') return 'Нет в наличии';
  if (stockVariant.value === 'low') return 'Мало';
  return 'В наличии';
});

function dec() { if (qty.value > 1) qty.value--; }
function inc() { qty.value++; }
</script>

<template>
  <div class="buy-panel">
    <div class="buy-panel__card">
      <div class="buy-panel__price-label">Цена клиента</div>

      <div v-if="showPrices && price !== undefined" class="buy-panel__price">
        {{ formattedPrice }}
      </div>
      <div v-else-if="!showPrices" class="buy-panel__price-hint">
        Войдите для просмотра цен
      </div>
      <div v-else class="buy-panel__price">—</div>

      <div class="buy-panel__price-note">Цена с учётом условий клиента. НДС включён.</div>

      <div class="buy-panel__info">
        <div class="buy-panel__info-row">
          <span>Наличие</span>
          <strong
            :class="{
              'buy-panel__stock--ok': stockVariant === 'ok',
              'buy-panel__stock--low': stockVariant === 'low',
              'buy-panel__stock--out': stockVariant === 'out',
            }"
          >{{ stockText }}</strong>
        </div>
        <div class="buy-panel__info-row"><span>Склад</span><strong>Центральный склад</strong></div>
        <div class="buy-panel__info-row"><span>Отгрузка</span><strong>Сегодня</strong></div>
        <div class="buy-panel__info-row"><span>Кратность</span><strong>1 шт.</strong></div>
      </div>

      <div class="buy-panel__qty-row">
        <div class="buy-panel__qty">
          <button class="buy-panel__qty-btn" type="button" @click="dec">−</button>
          <span class="buy-panel__qty-val">{{ qty }}</span>
          <button class="buy-panel__qty-btn" type="button" @click="inc">+</button>
        </div>
        <button class="buy-panel__fav" type="button">♡ В избранное</button>
      </div>

      <button
        class="buy-panel__add"
        type="button"
        :disabled="!showPrices || stockVariant === 'out'"
        @click="emit('add-to-cart', qty)"
      >
        Добавить в корзину
      </button>

      <button class="buy-panel__secondary" type="button" :disabled="!showPrices">
        Купить в 1 клик
      </button>
    </div>

    <div v-if="authStore.isLoggedIn" class="buy-panel__notice buy-panel__notice--green">
      <span>✓</span>
      <div>
        <strong>Можно оформить без оплаты.</strong>
        Доступный лимит клиента: 420 000 ₽. Позиция укладывается в лимит.
      </div>
    </div>

    <div class="buy-panel__card buy-panel__delivery">
      <h2 class="buy-panel__delivery-title">Доставка</h2>
      <div class="buy-panel__delivery-sub">До текущей торговой точки клиента.</div>
      <div class="buy-panel__info">
        <div class="buy-panel__info-row"><span>Адрес</span><strong>Северное шоссе, 12</strong></div>
        <div class="buy-panel__info-row"><span>Срок</span><strong>Сегодня до 18:00</strong></div>
        <div class="buy-panel__info-row"><span>Условие</span><strong>По договору</strong></div>
      </div>
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
.buy-panel__price { font-size: 32px; font-weight: 900; letter-spacing: -0.04em; color: #14231f; line-height: 1; margin-bottom: 6px; }
.buy-panel__price-hint { font-size: 14px; color: #a8b8b2; margin-bottom: 6px; }
.buy-panel__price-note { font-size: 12px; color: #a8b8b2; margin-bottom: 16px; }

.buy-panel__info { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.buy-panel__info-row { display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
.buy-panel__info-row span { color: #66736e; }
.buy-panel__info-row strong { color: #14231f; font-weight: 700; }

.buy-panel__stock--ok { color: #00a873 !important; }
.buy-panel__stock--low { color: #f57c00 !important; }
.buy-panel__stock--out { color: #b4ccc4 !important; }

.buy-panel__qty-row { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; }

.buy-panel__qty {
  display: flex;
  align-items: center;
  border: 1.5px solid #dde7e2;
  border-radius: 12px;
  overflow: hidden;
  height: 44px;
  flex-shrink: 0;
}

.buy-panel__qty-btn {
  width: 38px;
  height: 100%;
  border: none;
  background: transparent;
  font-size: 20px;
  cursor: pointer;
  color: #2c3b36;
  display: flex;
  align-items: center;
  justify-content: center;
}
.buy-panel__qty-btn:hover { background: #f4faf7; }

.buy-panel__qty-val { min-width: 36px; text-align: center; font-size: 15px; font-weight: 700; color: #14231f; }

.buy-panel__fav {
  flex: 1;
  height: 44px;
  border: 1.5px solid #dde7e2;
  border-radius: 12px;
  background: transparent;
  color: #66736e;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
}
.buy-panel__fav:hover { border-color: #e05; color: #e05; }

.buy-panel__add {
  width: 100%;
  height: 52px;
  border: none;
  border-radius: 14px;
  background: #ff8a00;
  color: #fff;
  font-size: 16px;
  font-weight: 800;
  font-family: inherit;
  cursor: pointer;
  margin-bottom: 10px;
  transition: background 0.15s;
}
.buy-panel__add:hover:not(:disabled) { background: #e07a00; }
.buy-panel__add:disabled { opacity: 0.45; cursor: not-allowed; }

.buy-panel__secondary {
  width: 100%;
  height: 44px;
  border: 1.5px solid #dde7e2;
  border-radius: 14px;
  background: transparent;
  color: #2c3b36;
  font-size: 14px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.15s;
}
.buy-panel__secondary:hover:not(:disabled) { border-color: #00b894; color: #00b894; }
.buy-panel__secondary:disabled { opacity: 0.45; cursor: not-allowed; }

.buy-panel__notice {
  border-radius: 16px;
  padding: 14px 16px;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 13px;
  background: #f0faf6;
  border: 1px solid #b6e8d4;
  color: #1a5c40;
}
.buy-panel__notice--green span { font-size: 16px; color: #00a873; flex-shrink: 0; margin-top: 1px; }
.buy-panel__notice strong { display: block; margin-bottom: 2px; }

.buy-panel__delivery { margin-top: 0; }
.buy-panel__delivery-title { font-size: 17px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 4px; }
.buy-panel__delivery-sub { font-size: 13px; color: #66736e; margin-bottom: 14px; }
</style>
