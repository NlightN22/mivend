<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '../../stores/auth';

const authStore = useAuthStore();

const availableLimit = computed(() => {
    const cp = authStore.counterparty;
    if (!cp) return '—';
    const val = (cp.creditLimit - cp.creditBalance) / 100;
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(val);
});

const delayDays = computed(() => authStore.counterparty?.paymentDelayDays ?? 0);
</script>

<template>
  <div class="status-cards">
    <div class="status-cards__card">
      <div class="status-cards__top">
        <div class="status-cards__title">Active orders</div>
        <div class="status-cards__icon">📦</div>
      </div>
      <div class="status-cards__value">8</div>
      <div class="status-cards__note">3 awaiting reserve confirmation</div>
    </div>

    <div class="status-cards__card status-cards__card--blue">
      <div class="status-cards__top">
        <div class="status-cards__title">Available limit</div>
        <div class="status-cards__icon">₽</div>
      </div>
      <div class="status-cards__value">{{ availableLimit }}</div>
      <div class="status-cards__note">Payment delay: {{ delayDays }} days</div>
    </div>

    <div class="status-cards__card status-cards__card--warning">
      <div class="status-cards__top">
        <div class="status-cards__title">Documents</div>
        <div class="status-cards__icon">📄</div>
      </div>
      <div class="status-cards__value">12</div>
      <div class="status-cards__note">New documents this month</div>
    </div>
  </div>
</template>

<style scoped>
.status-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 22px;
}

.status-cards__card {
  background: #fff;
  border: 1px solid rgba(221, 231, 226, 0.86);
  border-radius: 20px;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  padding: 20px;
  min-height: 138px;
}

.status-cards__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.status-cards__title {
  color: #66736e;
  font-size: 14px;
  font-weight: 800;
}

.status-cards__icon {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: #e2f8ef;
  color: #008a64;
  font-size: 21px;
  font-weight: 950;
}

.status-cards__card--blue .status-cards__icon {
  background: #edf5ff;
  color: #1c65b8;
}

.status-cards__card--warning .status-cards__icon {
  background: #fff4e3;
  color: #b36a00;
}

.status-cards__value {
  font-size: 28px;
  font-weight: 950;
  letter-spacing: -0.05em;
  margin-bottom: 4px;
}

.status-cards__note {
  color: #66736e;
  font-size: 13px;
  line-height: 1.35;
}

@media (max-width: 1240px) {
  .status-cards { grid-template-columns: 1fr; }
}
</style>
