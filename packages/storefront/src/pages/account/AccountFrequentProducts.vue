<script setup lang="ts">
const products = [
    { emoji: '🛢️', sku: 'AR-5812', brand: 'G-Energy', name: 'Motor oil 5W-40, 4 L', price: 2890 },
    { emoji: '🔧', sku: 'FL-2201', brand: 'Mann', name: 'Oil filter for popular models', price: 640 },
    { emoji: '🧊', sku: 'AF-7710', brand: 'Nord', name: 'Antifreeze G12 red, 5 kg', price: 780 },
    { emoji: '💡', sku: 'LB-H7', brand: 'Osram', name: 'Auto lamp H7 12V', price: 410 },
];

const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
</script>

<template>
  <div class="frequent-products">
    <div class="frequent-products__header">
      <div>
        <h2 class="frequent-products__title">Frequently Bought</h2>
        <div class="frequent-products__subtitle">Quick add regular items to cart.</div>
      </div>
      <a href="#" class="frequent-products__link-more">Open order repeat</a>
    </div>

    <div class="frequent-products__grid">
      <div v-for="p in products" :key="p.sku" class="frequent-products__card">
        <div class="frequent-products__img">{{ p.emoji }}</div>
        <div class="frequent-products__body">
          <div class="frequent-products__meta">
            <span>{{ p.sku }}</span><span>{{ p.brand }}</span>
          </div>
          <div class="frequent-products__name">{{ p.name }}</div>
          <div class="frequent-products__bottom">
            <div class="frequent-products__price">{{ fmt(p.price) }}</div>
            <button class="frequent-products__add">+</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.frequent-products {
  background: #fff;
  border-radius: 28px;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  border: 1px solid rgba(221, 231, 226, 0.86);
  padding: 22px;
  margin-bottom: 22px;
}

.frequent-products__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}

.frequent-products__title {
  margin: 0 0 5px;
  font-size: 26px;
  letter-spacing: -0.045em;
}

.frequent-products__subtitle {
  color: #66736e;
  font-size: 14px;
  line-height: 1.45;
}

.frequent-products__link-more {
  color: #008a64;
  font-weight: 950;
  font-size: 14px;
  white-space: nowrap;
  text-decoration: none;
}

.frequent-products__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.frequent-products__card {
  border: 1px solid #dde7e2;
  border-radius: 20px;
  background: #fff;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.frequent-products__img {
  height: 116px;
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, #f7fbfa, #ebf8f2);
  font-size: 42px;
  border-bottom: 1px solid #edf2ef;
}

.frequent-products__body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.frequent-products__meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: #66736e;
  font-size: 12px;
  font-weight: 850;
}

.frequent-products__name {
  min-height: 42px;
  line-height: 1.32;
  font-weight: 850;
  font-size: 14px;
}

.frequent-products__bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: auto;
}

.frequent-products__price {
  font-size: 18px;
  font-weight: 950;
  letter-spacing: -0.04em;
}

.frequent-products__add {
  width: 42px;
  height: 38px;
  border: 0;
  border-radius: 12px;
  background: #ff8a00;
  color: #fff;
  font-weight: 950;
  cursor: pointer;
  font: inherit;
}

@media (max-width: 1240px) {
  .frequent-products__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 620px) {
  .frequent-products__grid { grid-template-columns: 1fr; }
}
</style>
