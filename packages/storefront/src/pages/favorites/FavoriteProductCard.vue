<script setup lang="ts">
export interface FavoriteProduct {
    id: string;
    brand: string;
    sku: string;
    name: string;
    note: string;
    price: string;
    stockLabel: string;
    stockVariant: 'ok' | 'low' | 'none';
    qty: number;
    emoji: string;
}

const props = defineProps<{ product: FavoriteProduct }>();

const emit = defineEmits<{
    remove: [id: string];
    addToCart: [id: string, qty: number];
    qtyChange: [id: string, delta: number];
}>();
</script>

<template>
  <article
    class="fav-card"
    :class="{ 'fav-card--warning': props.product.stockVariant === 'low' }"
  >
    <button class="fav-card__heart" aria-label="Remove from favorites" @click="emit('remove', props.product.id)">♥</button>

    <div class="fav-card__img">{{ props.product.emoji }}</div>

    <div class="fav-card__body">
      <div class="fav-card__meta">
        <span>{{ props.product.brand }}</span>
        <span>{{ props.product.sku }}</span>
      </div>
      <div class="fav-card__name">{{ props.product.name }}</div>
      <div class="fav-card__note">{{ props.product.note }}</div>

      <div class="fav-card__price-row">
        <div class="fav-card__price">{{ props.product.price }}</div>
        <div
          class="fav-card__stock"
          :class="{
            'fav-card__stock--low': props.product.stockVariant === 'low',
            'fav-card__stock--none': props.product.stockVariant === 'none',
          }"
        >{{ props.product.stockLabel }}</div>
      </div>

      <div v-if="props.product.stockVariant !== 'none'" class="fav-card__actions">
        <div class="fav-card__qty">
          <button @click="emit('qtyChange', props.product.id, -1)">−</button>
          <span>{{ props.product.qty }}</span>
          <button @click="emit('qtyChange', props.product.id, 1)">+</button>
        </div>
        <button class="fav-card__remove" @click="emit('remove', props.product.id)" aria-label="Remove">×</button>
      </div>

      <div v-else class="fav-card__actions fav-card__actions--none">
        <button class="fav-card__analogs">View analogs</button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.fav-card {
  position: relative;
  border: 1px solid rgba(221, 231, 226, 0.9);
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 374px;
}

.fav-card--warning { border-color: rgba(255, 138, 0, 0.28); }

.fav-card__heart {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 38px;
  height: 38px;
  border: 1px solid #ffd2df;
  border-radius: 50%;
  background: #fff7fa;
  display: grid;
  place-items: center;
  color: #ff4f88;
  font-size: 18px;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(27, 45, 38, 0.08);
}

.fav-card__img {
  height: 142px;
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, #f7fbfa, #ebf8f2);
  font-size: 50px;
  border-bottom: 1px solid #edf2ef;
}

.fav-card__body {
  padding: 15px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}

.fav-card__meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: #66736e;
  font-size: 12px;
  font-weight: 850;
}

.fav-card__name {
  min-height: 46px;
  line-height: 1.35;
  font-weight: 900;
}

.fav-card__note {
  color: #66736e;
  font-size: 13px;
  line-height: 1.35;
  min-height: 36px;
}

.fav-card__price-row {
  margin-top: auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.fav-card__price {
  font-size: 22px;
  font-weight: 950;
  letter-spacing: -0.045em;
}

.fav-card__stock {
  background: #e2f8ef;
  color: #008a64;
  border-radius: 999px;
  padding: 5px 8px;
  font-size: 12px;
  font-weight: 950;
  white-space: nowrap;
}

.fav-card__stock--low {
  background: #fff5df;
  color: #e87800;
}

.fav-card__stock--none {
  background: #eef4f1;
  color: #5f6e68;
}

.fav-card__actions {
  display: grid;
  grid-template-columns: 1fr 44px;
  gap: 8px;
}

.fav-card__actions--none {
  grid-template-columns: 1fr;
}

.fav-card__qty {
  min-height: 42px;
  display: grid;
  grid-template-columns: 38px 1fr 38px;
  align-items: center;
  border-radius: 13px;
  background: #f3f8f6;
  overflow: hidden;
  color: #17231f;
  font-weight: 950;
}

.fav-card__qty button {
  border: 0;
  background: transparent;
  min-height: 42px;
  cursor: pointer;
  font-weight: 950;
  font-size: 18px;
}

.fav-card__qty span { text-align: center; }

.fav-card__remove {
  min-height: 42px;
  border-radius: 13px;
  border: 0;
  background: #fff2f1;
  color: #c0362c;
  font: inherit;
  font-weight: 950;
  font-size: 20px;
  cursor: pointer;
}

.fav-card__analogs {
  min-height: 42px;
  border: 0;
  border-radius: 13px;
  padding: 0 14px;
  background: #f3f8f6;
  color: #263732;
  font: inherit;
  font-weight: 950;
  cursor: pointer;
}
</style>
