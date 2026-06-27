<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '../../stores/auth';

const authStore = useAuthStore();
const displayName = computed(() =>
    authStore.counterparty?.shortName ?? authStore.customer?.firstName ?? '',
);
</script>

<template>
  <div class="account-hero">
    <div class="account-hero__copy">
      <div class="account-hero__kicker">Customer workspace</div>
      <h1 class="account-hero__title">Good afternoon, {{ displayName }}</h1>
      <p class="account-hero__text">
        Your orders, documents, favorites, limits and requests are here.
        The catalog and cart remain in the store, and order repeat is available from past orders.
      </p>
    </div>
  </div>
</template>

<style scoped>
.account-hero {
  position: relative;
  overflow: hidden;
  min-height: 170px;
  border-radius: 28px;
  background:
    radial-gradient(circle at 88% 20%, rgba(217, 255, 79, 0.78), transparent 32%),
    linear-gradient(135deg, #ffffff 0%, #eafff4 100%);
  border: 1px solid rgba(221, 231, 226, 0.86);
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  padding: 28px;
  margin-bottom: 22px;
}

.account-hero::after {
  content: '';
  position: absolute;
  right: -84px;
  bottom: -120px;
  width: 280px;
  height: 280px;
  border-radius: 50%;
  background: rgba(0, 168, 120, 0.11);
}

.account-hero__copy {
  position: relative;
  z-index: 1;
  max-width: 680px;
}

.account-hero__kicker {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #fff;
  border: 1px solid #dde7e2;
  color: #008a64;
  border-radius: 999px;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 850;
  margin-bottom: 14px;
}

.account-hero__title {
  margin: 0 0 10px;
  font-size: clamp(32px, 3.6vw, 48px);
  line-height: 1;
  letter-spacing: -0.055em;
}

.account-hero__text {
  margin: 0;
  color: #4b5c56;
  font-size: 16px;
  line-height: 1.48;
}
</style>
