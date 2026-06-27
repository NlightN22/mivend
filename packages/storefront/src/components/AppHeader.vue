<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useCartStore } from '../stores/cart';

const router = useRouter();
const authStore = useAuthStore();
const cartStore = useCartStore();
const searchQuery = ref('');

const cartTotal = computed(() => {
    if (cartStore.totalPrice === 0) return '0 ₽';
    return new Intl.NumberFormat('ru-RU').format(cartStore.totalPrice) + ' ₽';
});

function onSearch(value: string): void {
  router.push({ path: '/catalog', query: value ? { q: value } : {} });
}
</script>

<template>
  <div class="app-header-wrap">
    <div v-if="authStore.isLoggedIn" class="app-header__strip">
      <div class="app-header__strip-inner">
        <span><strong>B2B Portal</strong> for fast ordering of auto parts and consumables</span>
        <span>Live stock and prices</span>
      </div>
    </div>

    <header class="app-header">
      <div class="app-header__inner">
        <RouterLink to="/" class="app-header__logo-link" aria-label="Главная">
          <MvLogo name="mivend" size="md" />
        </RouterLink>

        <button class="app-header__catalog-btn">
          &#9776; Catalogue
        </button>

        <div class="app-header__search">
          <MvSearchInput
            v-model="searchQuery"
            placeholder="Артикул, VIN, бренд, название или OEM"
            :suggestions="[]"
            @search="onSearch"
          />
        </div>

        <nav class="app-header__nav">
          <template v-if="authStore.isLoggedIn">
            <RouterLink to="/account" class="app-header__nav-link app-header__nav-link--icon">
              <span class="app-header__nav-icon">&#128100;</span>
            </RouterLink>
            <RouterLink to="/orders" class="app-header__nav-link">
              <span class="app-header__nav-icon">&#128230;</span>
              <span>Orders</span>
            </RouterLink>
            <a href="#" class="app-header__nav-link">
              <span class="app-header__nav-icon">&#9825;</span>
              <span>Favourites</span>
            </a>
            <RouterLink to="/cart" class="app-header__cart">
              <span>&#128722;</span>
              <span class="app-header__cart-text">
                <small>Cart</small>
                {{ cartTotal }}
              </span>
              <span class="app-header__cart-badge">{{ cartStore.itemCount }}</span>
            </RouterLink>
          </template>

          <template v-else>
            <RouterLink to="/login" class="app-header__nav-link">
              <span class="app-header__nav-icon">&#128100;</span>
              <span>Sign in</span>
            </RouterLink>
          </template>
        </nav>
      </div>

      <div v-if="authStore.isLoggedIn" class="app-header__delivery">
        <span class="app-header__delivery-line">
          <template v-if="authStore.tradingPoint">
            Trading point &middot;
            <strong>{{ authStore.tradingPoint.name }}</strong>
            <span class="app-header__delivery-address">&nbsp;— {{ authStore.tradingPoint.address }}</span>
          </template>
          <template v-else>
            <span class="app-header__delivery-hint">No trading point selected</span>
          </template>
        </span>
      </div>
    </header>
  </div>
</template>

<style scoped>
.app-header-wrap {
  position: sticky;
  top: 0;
  z-index: 20;
}

.app-header__strip {
  background: #14231f;
  color: #d8eee7;
  font-size: 13px;
}

.app-header__strip-inner {
  max-width: 1440px;
  margin: 0 auto;
  padding: 8px 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.app-header__strip strong { color: #fff; }

.app-header {
  background: rgba(255, 255, 255, 0.94);
  border-bottom: 1px solid #dde7e2;
  backdrop-filter: blur(16px);
}

.app-header__inner {
  max-width: 1440px;
  margin: 0 auto;
  padding: 12px 28px 8px;
  display: grid;
  grid-template-columns: 160px 144px minmax(360px, 1fr) auto;
  gap: 12px;
  align-items: center;
}

.app-header__logo-link {
  text-decoration: none;
  color: inherit;
}

.app-header__catalog-btn {
  width: 100%;
  height: 52px;
  border: none;
  border-radius: 14px;
  background: var(--app-accent-lime, #c8f21a);
  color: #14231f;
  font-size: 15px;
  font-weight: 800;
  font-family: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  white-space: nowrap;
  box-shadow: 0 8px 18px rgba(200, 242, 26, 0.28);
  transition: background 0.15s;
}

.app-header__catalog-btn:hover {
  background: #b8e010;
}

.app-header__nav-link--icon {
  min-width: 44px;
}

.app-header__search {
  min-width: 0;
}

.app-header__nav {
  display: flex;
  align-items: center;
  gap: 6px;
}

.app-header__nav-link {
  min-height: 48px;
  min-width: 60px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  font-size: 11px;
  font-weight: 700;
  color: #7b8984;
  text-decoration: none;
  padding: 0 6px;
}

.app-header__nav-link:hover {
  background: #f4faf7;
  color: #008a64;
}

.app-header__nav-icon {
  font-size: 18px;
  line-height: 1;
}

.app-header__cart {
  min-height: 52px;
  min-width: 160px;
  border-radius: 18px;
  background: var(--app-accent-orange, #ff8a00);
  color: #fff;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px 0 14px;
  font-weight: 800;
  font-size: 15px;
  text-decoration: none;
  box-shadow: 0 10px 22px rgba(255, 138, 0, 0.22);
}

.app-header__cart-text {
  flex: 1;
  line-height: 1.1;
  white-space: nowrap;
}

.app-header__cart-text small {
  display: block;
  font-size: 11px;
  opacity: 0.9;
}

.app-header__cart-badge {
  min-width: 32px;
  height: 32px;
  border-radius: 999px;
  background: #fff;
  color: var(--app-accent-orange, #ff8a00);
  display: grid;
  place-items: center;
  font-weight: 900;
  font-size: 14px;
  flex-shrink: 0;
}

.app-header__delivery {
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 28px 8px;
  display: flex;
  justify-content: flex-end;
}

.app-header__delivery-line {
  font-size: 13px;
  color: #66736e;
}

.app-header__delivery-line strong {
  color: #008a64;
  font-weight: 900;
}

.app-header__delivery-address {
  color: #a8b8b2;
}

.app-header__delivery-hint {
  color: #a8b8b2;
  font-style: italic;
}
</style>
