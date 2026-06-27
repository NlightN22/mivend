<template>
  <div class="account">
    <h1 class="account__title">My Account</h1>

    <div class="account__grid">
      <section class="account__card">
        <h2 class="account__section-title">Profile</h2>
        <dl class="account__dl">
          <dt>Name</dt>
          <dd>{{ fullName || '—' }}</dd>
          <dt>Email</dt>
          <dd>{{ customer?.emailAddress ?? '—' }}</dd>
          <dt>Role</dt>
          <dd><span class="account__badge">{{ customer?.customFields?.portalRole ?? '—' }}</span></dd>
        </dl>
      </section>

      <section v-if="counterparty" class="account__card">
        <h2 class="account__section-title">Company</h2>
        <dl class="account__dl">
          <dt>Legal name</dt>
          <dd>{{ counterparty.legalName }}</dd>
          <dt>Short name</dt>
          <dd>{{ counterparty.shortName }}</dd>
          <dt>INN</dt>
          <dd>{{ counterparty.inn ?? '—' }}</dd>
          <dt>Price type</dt>
          <dd><span class="account__badge account__badge--lime">{{ counterparty.priceType }}</span></dd>
        </dl>
      </section>

      <section v-if="counterparty" class="account__card account__card--wide">
        <h2 class="account__section-title">Credit &amp; Payment</h2>
        <div class="account__credit-grid">
          <div class="account__credit-item">
            <span class="account__credit-label">Credit limit</span>
            <strong class="account__credit-value">{{ formatRub(counterparty.creditLimit / 100) }}</strong>
          </div>
          <div class="account__credit-item">
            <span class="account__credit-label">Used</span>
            <strong class="account__credit-value">{{ formatRub(counterparty.creditBalance / 100) }}</strong>
          </div>
          <div class="account__credit-item">
            <span class="account__credit-label">Available</span>
            <strong class="account__credit-value account__credit-value--green">
              {{ formatRub((counterparty.creditLimit - counterparty.creditBalance) / 100) }}
            </strong>
          </div>
          <div class="account__credit-item">
            <span class="account__credit-label">Payment delay</span>
            <strong class="account__credit-value">{{ counterparty.paymentDelayDays }} days</strong>
          </div>
        </div>
        <div v-if="counterparty.creditLimit > 0" class="account__credit-bar-wrap">
          <div class="account__credit-bar" :style="{ width: usedPercent + '%' }" />
        </div>
      </section>

      <section v-if="tradingPoint" class="account__card">
        <h2 class="account__section-title">Trading Point</h2>
        <dl class="account__dl">
          <dt>Name</dt>
          <dd>{{ tradingPoint.name }}</dd>
          <dt>Address</dt>
          <dd>{{ tradingPoint.address }}</dd>
          <template v-if="tradingPoint.workingHours">
            <dt>Hours</dt>
            <dd>{{ tradingPoint.workingHours }}</dd>
          </template>
          <template v-if="tradingPoint.deliveryComment">
            <dt>Note</dt>
            <dd>{{ tradingPoint.deliveryComment }}</dd>
          </template>
        </dl>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '../../stores/auth';

const authStore = useAuthStore();
const customer = computed(() => authStore.customer);
const counterparty = computed(() => authStore.counterparty);
const tradingPoint = computed(() => authStore.tradingPoint);
const fullName = computed(() =>
  [customer.value?.firstName, customer.value?.lastName].filter(Boolean).join(' '),
);
const usedPercent = computed(() => {
  if (!counterparty.value || counterparty.value.creditLimit === 0) return 0;
  return Math.min(100, Math.round((counterparty.value.creditBalance / counterparty.value.creditLimit) * 100));
});
const formatRub = (n: number) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n);
</script>

<style scoped>
.account {
  max-width: 1000px;
  margin: 0 auto;
  padding: 32px 24px;
}

.account__title {
  font-size: 28px;
  font-weight: 900;
  letter-spacing: -0.03em;
  color: #14231f;
  margin: 0 0 24px;
}

.account__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.account__card {
  background: #fff;
  border: 1px solid #dde7e2;
  border-radius: 20px;
  padding: 20px 24px;
}

.account__card--wide {
  grid-column: 1 / -1;
}

.account__section-title {
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #a8b8b2;
  margin: 0 0 14px;
}

.account__dl {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 8px 12px;
  margin: 0;
}

.account__dl dt {
  color: #66736e;
  font-size: 13px;
  align-self: center;
}

.account__dl dd {
  font-size: 14px;
  font-weight: 600;
  color: #14231f;
  margin: 0;
  align-self: center;
}

.account__badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  background: #f4faf7;
  color: #008a64;
  font-size: 12px;
  font-weight: 700;
}

.account__badge--lime {
  background: #f0f9d0;
  color: #5a7a00;
}

.account__credit-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.account__credit-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.account__credit-label {
  font-size: 12px;
  color: #a8b8b2;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.account__credit-value {
  font-size: 20px;
  font-weight: 900;
  letter-spacing: -0.02em;
  color: #14231f;
}

.account__credit-value--green {
  color: #008a64;
}

.account__credit-bar-wrap {
  height: 6px;
  border-radius: 999px;
  background: #f4faf7;
  overflow: hidden;
}

.account__credit-bar {
  height: 100%;
  border-radius: 999px;
  background: #ff8a00;
  transition: width 0.4s ease;
}
</style>
