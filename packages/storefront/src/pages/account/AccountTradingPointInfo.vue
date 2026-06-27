<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '../../stores/auth';

const authStore = useAuthStore();
const tradingPoint = computed(() => authStore.tradingPoint);
const counterparty = computed(() => authStore.counterparty);

const availableLimit = computed(() => {
    const cp = counterparty.value;
    if (!cp || cp.creditLimit === 0) return null;
    return (cp.creditLimit - cp.creditBalance) / 100;
});

const limitWarning = computed(() => {
    if (!availableLimit.value) return false;
    const cp = counterparty.value!;
    return availableLimit.value < cp.creditLimit / 100 * 0.2;
});
</script>

<template>
  <div class="trading-point-info">
    <div class="trading-point-info__header">
      <div>
        <h2 class="trading-point-info__title">Current Point</h2>
        <div class="trading-point-info__subtitle">Default delivery is linked to the trading point.</div>
      </div>
      <RouterLink to="/account/trading-points" class="trading-point-info__link-more">Change</RouterLink>
    </div>

    <div class="trading-point-info__list">
      <div v-if="tradingPoint" class="trading-point-info__row">
        <div>
          <div class="trading-point-info__row-title">{{ tradingPoint.address }}</div>
          <div class="trading-point-info__row-note">{{ tradingPoint.name }} · delivery today until 18:00</div>
        </div>
      </div>
      <div v-if="counterparty" class="trading-point-info__row">
        <div>
          <div class="trading-point-info__row-title">Contract B2B-014</div>
          <div class="trading-point-info__row-note">
            Deferred {{ counterparty.paymentDelayDays }} days · limit
            {{ new Intl.NumberFormat('ru-RU').format(counterparty.creditLimit / 100) }} ₽
          </div>
        </div>
      </div>
    </div>

    <div v-if="limitWarning" class="trading-point-info__notice">
      <div>⚠️</div>
      <div>
        <strong>Credit limit almost reached</strong>
        When placing a large order the system will show a warning at checkout.
      </div>
    </div>
    <div v-else class="trading-point-info__notice">
      <div>⚠️</div>
      <div>
        <strong>Credit limit notice</strong>
        When placing a large order the system will show a warning at checkout.
      </div>
    </div>
  </div>
</template>

<style scoped>
.trading-point-info {
  background: #fff;
  border-radius: 28px;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  border: 1px solid rgba(221, 231, 226, 0.86);
  padding: 22px;
}

.trading-point-info__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}

.trading-point-info__title {
  margin: 0 0 5px;
  font-size: 26px;
  letter-spacing: -0.045em;
}

.trading-point-info__subtitle {
  color: #66736e;
  font-size: 14px;
  line-height: 1.45;
}

.trading-point-info__link-more {
  color: #008a64;
  font-weight: 950;
  font-size: 14px;
  white-space: nowrap;
  text-decoration: none;
}

.trading-point-info__list { display: grid; gap: 10px; }

.trading-point-info__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 58px;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid #edf2ef;
  background: #fbfdfc;
}

.trading-point-info__row-title {
  font-weight: 900;
  margin-bottom: 3px;
}

.trading-point-info__row-note {
  color: #66736e;
  font-size: 13px;
  line-height: 1.3;
}

.trading-point-info__notice {
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid rgba(255, 138, 0, 0.22);
  background: #fff4e3;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  color: #573a14;
  margin-top: 14px;
  font-size: 14px;
  line-height: 1.42;
}

.trading-point-info__notice strong {
  display: block;
  color: #33210a;
  margin-bottom: 2px;
}
</style>
