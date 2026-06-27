<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '../../stores/auth';

const authStore = useAuthStore();

const limitText = computed(() => {
    const cp = authStore.counterparty;
    if (!cp) return 'No limit data';
    const avail = new Intl.NumberFormat('ru-RU').format((cp.creditLimit - cp.creditBalance) / 100);
    return `${avail} ₽ available, deferred ${cp.paymentDelayDays} days`;
});
</script>

<template>
  <div class="quick-actions">
    <div class="quick-actions__header">
      <div>
        <h2 class="quick-actions__title">Requires Attention</h2>
        <div class="quick-actions__subtitle">Quick links without duplicating cart or order repeat.</div>
      </div>
    </div>

    <div class="quick-actions__grid">
      <a href="#" class="quick-actions__card">
        <div>
          <div class="quick-actions__icon">📄</div>
          <div class="quick-actions__card-title">New documents</div>
          <div class="quick-actions__card-text">12 documents available this month.</div>
        </div>
      </a>
      <a href="#" class="quick-actions__card">
        <div>
          <div class="quick-actions__icon">₽</div>
          <div class="quick-actions__card-title">Limit &amp; deferred</div>
          <div class="quick-actions__card-text">{{ limitText }}</div>
        </div>
      </a>
      <a href="#" class="quick-actions__card">
        <div>
          <div class="quick-actions__icon">💬</div>
          <div class="quick-actions__card-title">Open requests</div>
          <div class="quick-actions__card-text">2 requests awaiting response.</div>
        </div>
      </a>
    </div>
  </div>
</template>

<style scoped>
.quick-actions {
  background: #fff;
  border-radius: 28px;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  border: 1px solid rgba(221, 231, 226, 0.86);
  padding: 22px;
  margin-bottom: 22px;
}

.quick-actions__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}

.quick-actions__title {
  margin: 0 0 5px;
  font-size: 26px;
  letter-spacing: -0.045em;
}

.quick-actions__subtitle {
  color: #66736e;
  font-size: 14px;
  line-height: 1.45;
}

.quick-actions__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.quick-actions__card {
  min-height: 128px;
  border: 1px solid #edf2ef;
  border-radius: 20px;
  padding: 18px;
  background: #fbfdfc;
  display: grid;
  align-content: space-between;
  text-decoration: none;
  color: inherit;
  transition: 0.16s ease;
}

.quick-actions__card:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 24px rgba(27, 45, 38, 0.08);
}

.quick-actions__icon {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: #e2f8ef;
  color: #008a64;
  font-size: 20px;
  font-weight: 950;
  margin-bottom: 12px;
}

.quick-actions__card-title {
  font-weight: 950;
  letter-spacing: -0.025em;
  margin-bottom: 5px;
}

.quick-actions__card-text {
  color: #66736e;
  font-size: 13px;
  line-height: 1.35;
}

@media (max-width: 1240px) {
  .quick-actions__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 620px) {
  .quick-actions__grid { grid-template-columns: 1fr; }
}
</style>
