<script setup lang="ts">
import { onMounted } from 'vue';
import { useCartStore } from '../../stores/cart';
import CartItemList from './CartItemList.vue';
import CartSummary from './CartSummary.vue';
import CartPromoBanner from './CartPromoBanner.vue';

const cartStore = useCartStore();

onMounted(() => cartStore.fetchCart());
</script>

<template>
  <main class="cart-page">
    <MvBreadcrumbs
      class="cart-page__crumbs"
      :items="[{ label: 'Home', to: '/' }, { label: 'Cart' }]"
    />

    <div class="cart-page__title-row">
      <h1 class="cart-page__title">
        Cart
        <span class="cart-page__count">{{ cartStore.lines.length }} items</span>
      </h1>
      <p class="cart-page__hint">
        Prices and stock will be verified before sending the order to ERP. After submission the order awaits confirmation.
      </p>
    </div>

    <div v-if="cartStore.isEmpty" class="cart-page__empty">
      <div class="cart-page__empty-icon">🛒</div>
      <h2 class="cart-page__empty-title">Your cart is empty</h2>
      <p class="cart-page__empty-text">Add products from the catalog to place an order.</p>
      <RouterLink to="/catalog" class="cart-page__empty-btn">Go to catalog</RouterLink>
    </div>

    <template v-else>
      <div class="cart-page__layout">
        <CartItemList />
        <div class="cart-page__aside">
          <CartSummary />
          <CartPromoBanner />
        </div>
      </div>
    </template>

    <!-- TODO: recently viewed -->
  </main>
</template>

<style scoped>
.cart-page {
  max-width: 1440px;
  margin: 0 auto;
  padding: 32px 28px 70px;
}

.cart-page__crumbs { margin-bottom: 18px; }

.cart-page__title-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 26px;
}

.cart-page__title {
  margin: 0;
  font-size: 42px;
  line-height: 0.95;
  letter-spacing: -0.055em;
}

.cart-page__count {
  color: #66736e;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin-left: 10px;
}

.cart-page__hint {
  margin: 0;
  color: #66736e;
  font-size: 14px;
  max-width: 540px;
  text-align: right;
  line-height: 1.45;
}

.cart-page__layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 420px;
  gap: 24px;
  align-items: start;
}

.cart-page__aside {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.cart-page__empty {
  text-align: center;
  padding: 80px 40px;
  background: #fff;
  border-radius: 28px;
  border: 1px solid rgba(221, 231, 226, 0.86);
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
}

.cart-page__empty-icon { font-size: 64px; margin-bottom: 18px; }
.cart-page__empty-title { margin: 0 0 10px; font-size: 28px; font-weight: 900; letter-spacing: -0.04em; }
.cart-page__empty-text { margin: 0 0 24px; color: #66736e; font-size: 16px; }

.cart-page__empty-btn {
  display: inline-flex; align-items: center; justify-content: center;
  height: 52px; padding: 0 28px; border-radius: 16px;
  background: #00a878; color: #fff;
  font-size: 16px; font-weight: 800; text-decoration: none;
  transition: background 0.15s;
}
.cart-page__empty-btn:hover { background: #008a64; }

@media (max-width: 1180px) {
  .cart-page__layout { grid-template-columns: 1fr; }
}

@media (max-width: 900px) {
  .cart-page__title-row { display: block; }
  .cart-page__hint { text-align: left; margin-top: 8px; }
}

@media (max-width: 560px) {
  .cart-page { padding-left: 16px; padding-right: 16px; }
  .cart-page__title { font-size: 32px; }
}
</style>
