<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useCartStore, type CartLine } from '../../stores/cart';

const props = defineProps<{ line: CartLine; checked: boolean }>();
const emit = defineEmits<{ 'update:checked': [value: boolean] }>();

const cartStore = useCartStore();
const qty = ref(props.line.quantity);

watch(() => props.line.quantity, (v) => { qty.value = v; });

const brand = computed(() =>
    props.line.productVariant.product.facetValues.find(fv => fv.facet.code === 'brand')?.name ?? '',
);

const stockVariant = computed((): 'ok' | 'low' | 'out' => {
    const sl = props.line.productVariant.stockLevel;
    if (!sl || sl === 'OUT_OF_STOCK') return 'out';
    if (sl === 'LOW_STOCK') return 'low';
    return 'ok';
});

const itemTotal = computed(() =>
    new Intl.NumberFormat('ru-RU').format(props.line.linePriceWithTax / 100) + ' ₽',
);

async function onQtyChange(newQty: number): Promise<void> {
    if (newQty < 1) return;
    qty.value = newQty;
    await cartStore.adjustItem(props.line.id, newQty);
}

async function remove(): Promise<void> {
    await cartStore.removeItem(props.line.id);
}
</script>

<template>
  <article class="cart-item">
    <input
      type="checkbox"
      class="cart-item__check"
      :checked="checked"
      @change="emit('update:checked', ($event.target as HTMLInputElement).checked)"
    />

    <div class="cart-item__img">
      <span class="cart-item__img-icon" aria-hidden="true" />
    </div>

    <div class="cart-item__info">
      <RouterLink :to="`/product/${line.productVariant.product.slug}`" class="cart-item__name">
        {{ line.productVariant.product.name }}
      </RouterLink>
      <div class="cart-item__meta">
        <span>SKU {{ line.productVariant.sku }}</span>
        <span v-if="brand">{{ brand }}</span>
        <span>qty 1 pc.</span>
      </div>
      <div class="cart-item__pills">
        <MvStockBadge :variant="stockVariant" />
        <span class="cart-item__pill">Central warehouse</span>
      </div>
      <div class="cart-item__links">
        <button type="button">Favorites</button>
        <button type="button">Analogs</button>
      </div>
    </div>

    <div class="cart-item__price-block">
      <MvAmountDisplay
        :amount="line.linePriceWithTax / 100"
        currency="RUB"
        size="sm"
        class="cart-item__price"
      />
      <div class="cart-item__price-note">{{ itemTotal }}</div>
    </div>

    <div class="cart-item__qty">
      <MvQtyStepper :model-value="qty" :min="1" @update:model-value="onQtyChange" />
    </div>

    <button class="cart-item__remove" type="button" title="Remove" @click="remove">×</button>
  </article>
</template>

<style scoped>
.cart-item {
  display: grid;
  grid-template-columns: 28px 96px minmax(0, 1fr) 138px 140px 32px;
  gap: 14px;
  align-items: center;
  padding: 18px 0;
  border-bottom: 1px solid #edf2ef;
}
.cart-item:last-child { border-bottom: none; }

.cart-item__check { width: 20px; height: 20px; margin: 0; accent-color: #00a878; }

.cart-item__img {
  width: 96px; height: 96px; border-radius: 18px;
  background: linear-gradient(145deg, #f7fbfa, #ebf8f2);
  border: 1px solid #edf2ef;
  display: grid; place-items: center;
}
.cart-item__img-icon {
  display: block; width: 48px; height: 48px; border-radius: 50%;
  background: linear-gradient(135deg, #b8e8d8, #d8f4ea);
}

.cart-item__info { min-width: 0; }

.cart-item__name {
  display: block; font-size: 15px; font-weight: 850; line-height: 1.35;
  color: #17231f; text-decoration: none; margin-bottom: 8px;
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.cart-item__name:hover { color: #00a878; }

.cart-item__meta {
  display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;
  color: #66736e; font-size: 12px; font-weight: 800;
}

.cart-item__pills { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }

.cart-item__pill {
  display: inline-flex; align-items: center; min-height: 24px;
  border-radius: 999px; padding: 0 8px;
  background: #f4faf7; color: #53645e;
  font-size: 12px; font-weight: 850;
}

.cart-item__links { display: flex; gap: 12px; color: #66736e; font-size: 13px; font-weight: 800; }
.cart-item__links button {
  border: none; background: transparent; padding: 0;
  color: inherit; font-size: inherit; font-weight: inherit; cursor: pointer;
}
.cart-item__links button:hover { color: #008a64; }

.cart-item__price-block { text-align: right; white-space: nowrap; }
.cart-item__price { font-size: 19px !important; font-weight: 950 !important; color: #008a64 !important; }
.cart-item__price-note { margin-top: 3px; color: #94a09b; font-size: 12px; font-weight: 800; }

.cart-item__remove {
  width: 32px; height: 32px; border: none; border-radius: 12px;
  background: #f4faf7; color: #95a29d; font-size: 16px; font-weight: 900;
  cursor: pointer; display: grid; place-items: center;
}
.cart-item__remove:hover { background: #fff0ee; color: #f04438; }
</style>
