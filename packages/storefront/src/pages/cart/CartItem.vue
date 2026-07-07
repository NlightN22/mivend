<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { MvTooltip } from '@mivend/ui-kit';
import { useCartStore, type CartLine } from '../../stores/cart';
import { formatTierValue } from '../../utils/discount';
import { discountLineReason, discountTierReachedReason } from '../../utils/discountMessages';

const props = defineProps<{ line: CartLine; checked: boolean }>();
const emit = defineEmits<{ 'update:checked': [value: boolean] }>();

const cartStore = useCartStore();
const qty = ref(props.line.quantity);
const confirmingRemove = ref(false);

watch(() => props.line.quantity, (v) => { qty.value = v; });

const brand = computed(() =>
    props.line.productVariant.product.facetValues.find(fv => fv.facet.code === 'brand')?.name ?? '',
);

const totalWeightKg = computed(() => {
    const weight = props.line.productVariant.customFields.weight;
    return weight != null ? weight * props.line.quantity : null;
});

const discountPercent = computed(() => {
    const { unitPrice, compareAtPrice } = props.line;
    if (compareAtPrice == null || unitPrice == null) return null;
    const percent = Math.round((1 - unitPrice / compareAtPrice) * 100);
    return percent > 0 ? percent : null;
});

const discountReason = computed(() => {
    const tp = props.line.tierProgress;
    if (tp?.currentPercent) {
        return discountTierReachedReason(
            tp.facetName,
            formatTierValue(tp.current, tp.metric),
            tp.currentPercent,
        );
    }
    if (!brand.value || discountPercent.value == null) return null;
    return discountLineReason(brand.value, discountPercent.value);
});

const stockVariant = computed((): 'ok' | 'low' | 'out' => {
    const sl = props.line.productVariant.stockLevel;
    if (!sl || sl === 'OUT_OF_STOCK') return 'out';
    if (sl === 'LOW_STOCK') return 'low';
    return 'ok';
});

async function onQtyChange(newQty: number): Promise<void> {
    if (newQty === 0) {
        confirmingRemove.value = true;
        return;
    }
    qty.value = newQty;
    await cartStore.adjustItem(props.line.id, newQty);
}

async function confirmRemove(): Promise<void> {
    confirmingRemove.value = false;
    await cartStore.removeItem(props.line.id);
}

function cancelRemove(): void {
    confirmingRemove.value = false;
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
        <span>qty {{ line.quantity }} pc.</span>
        <span v-if="totalWeightKg != null">{{ totalWeightKg.toLocaleString() }} kg</span>
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
      <MvTooltip v-if="discountPercent && discountReason" placement="bottom">
        <template #trigger>
          <button type="button" class="cart-item__price-trigger">
            <MvAmountDisplay
              :amount="line.linePriceWithTax / 100"
              currency="RUB"
              size="sm"
              class="cart-item__price"
            />
            <MvAmountDisplay
              :amount="(line.compareAtPrice! * line.quantity) / 100"
              currency="RUB"
              size="sm"
              class="cart-item__old-price"
            />
          </button>
        </template>
        <div>{{ discountReason }}</div>
      </MvTooltip>
      <MvAmountDisplay
        v-else
        :amount="line.linePriceWithTax / 100"
        currency="RUB"
        size="sm"
        class="cart-item__price"
      />
    </div>

    <div class="cart-item__qty">
      <div v-if="confirmingRemove" class="cart-item__remove-confirm">
        <span>Remove?</span>
        <button class="cart-item__remove-confirm-yes" type="button" @click="confirmRemove">Yes</button>
        <button class="cart-item__remove-confirm-no" type="button" @click="cancelRemove">No</button>
      </div>
      <MvQtyStepper v-else :model-value="qty" :min="0" @update:model-value="onQtyChange" />
    </div>
  </article>
</template>

<style scoped>
.cart-item {
  display: grid;
  grid-template-columns: 28px 96px minmax(0, 1fr) 138px 160px;
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

.cart-item__price-block { text-align: left; white-space: nowrap; }
.cart-item__price { font-size: 19px !important; font-weight: 950 !important; color: #008a64 !important; }
.cart-item__old-price { display: block; font-size: 12px !important; color: #a8b8b2 !important; text-decoration: line-through; }

.cart-item__price-trigger {
  border: none; background: transparent; padding: 0; margin: 0;
  cursor: pointer; text-align: left; font-family: inherit;
  display: inline-flex; flex-direction: column; align-items: flex-start;
}

.cart-item__remove-confirm {
  display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 800; color: #66736e;
}
.cart-item__remove-confirm-yes {
  height: 32px; padding: 0 10px; border: none; border-radius: 10px;
  background: #fff0ee; color: #f04438; font-size: 12px; font-weight: 900;
  cursor: pointer; font-family: inherit;
}
.cart-item__remove-confirm-yes:hover { background: #fde3e0; }
.cart-item__remove-confirm-no {
  height: 32px; padding: 0 10px; border: none; border-radius: 10px;
  background: #f4faf7; color: #66736e; font-size: 12px; font-weight: 900;
  cursor: pointer; font-family: inherit;
}
.cart-item__remove-confirm-no:hover { background: #e2f8ef; color: #008a64; }
</style>
