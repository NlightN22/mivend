<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const status = computed(() => {
    const s = route.query.status;
    if (s === 'pending' || s === 'fail') return s;
    return 'success';
});

const config = computed(() => {
    if (status.value === 'success') {
        return {
            icon: '✓',
            iconClass: 'pr-icon--green',
            title: 'Payment successful',
            text: 'Payment for order #348744 has been processed. The order is confirmed.',
        };
    }
    if (status.value === 'pending') {
        return {
            icon: '⏳',
            iconClass: 'pr-icon--orange',
            title: 'Awaiting confirmation',
            text: 'Payment is being processed. This may take a few minutes. Order status will update automatically.',
        };
    }
    return {
        icon: '✕',
        iconClass: 'pr-icon--red',
        title: 'Payment failed',
        text: 'The payment could not be processed. Your order has not been confirmed. You can try again or choose a different payment method.',
    };
});

const today = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
}).format(new Date());
</script>

<template>
  <main class="pr-page">
    <MvBreadcrumbs
      class="pr-crumbs"
      :items="[{ label: 'Orders', to: '/orders' }, { label: 'Payment result' }]"
    />

    <div class="pr-head">
      <h1 class="pr-title">Payment result</h1>
    </div>

    <div class="pr-status-card" :class="`pr-status-card--${status}`">
      <div class="pr-icon" :class="config.iconClass">{{ config.icon }}</div>
      <h2 class="pr-status-title">{{ config.title }}</h2>
      <p class="pr-status-text">{{ config.text }}</p>

      <div class="pr-actions">
        <template v-if="status === 'success'">
          <RouterLink to="/orders" class="pr-btn pr-btn--primary">Open order</RouterLink>
          <a href="#" class="pr-btn pr-btn--secondary">Download receipt</a>
          <RouterLink to="/catalog" class="pr-btn pr-btn--ghost">Continue shopping</RouterLink>
        </template>
        <template v-else-if="status === 'pending'">
          <RouterLink to="/orders" class="pr-btn pr-btn--primary">Open order</RouterLink>
          <RouterLink to="/catalog" class="pr-btn pr-btn--ghost">Continue shopping</RouterLink>
        </template>
        <template v-else>
          <RouterLink to="/payment-stub" class="pr-btn pr-btn--primary">Try again</RouterLink>
          <RouterLink to="/checkout" class="pr-btn pr-btn--secondary">Choose another method</RouterLink>
          <RouterLink to="/catalog" class="pr-btn pr-btn--ghost">Continue shopping</RouterLink>
        </template>
      </div>
    </div>

    <div class="pr-details-card">
      <h3 class="pr-card-title">Payment details</h3>
      <div class="pr-detail-list">
        <div class="pr-detail"><span>Payment ID</span><strong>PAY-20260628-009821</strong></div>
        <div class="pr-detail"><span>Order</span><strong>#348744</strong></div>
        <div class="pr-detail"><span>Amount</span><strong>12 450 ₽</strong></div>
        <div class="pr-detail"><span>Method</span><strong>Online payment</strong></div>
        <div class="pr-detail"><span>Date</span><strong>{{ today }}</strong></div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.pr-page {
  max-width: 1440px;
  margin: 0 auto;
  padding: 24px 28px 70px;
}

.pr-crumbs { margin-bottom: 12px; }
.pr-head { margin-bottom: 24px; }

.pr-title {
  margin: 0;
  font-size: clamp(36px, 3.8vw, 54px);
  line-height: 0.98;
  letter-spacing: -0.06em;
}

.pr-status-card {
  max-width: 600px;
  margin: 0 auto 24px;
  background: #fff;
  border-radius: 28px;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  padding: 36px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  border: 1.5px solid #dde7e2;
}

.pr-status-card--success { border-color: #00a878; }
.pr-status-card--pending { border-color: #ff8a00; }
.pr-status-card--fail { border-color: #d92d20; }

.pr-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  font-size: 26px;
  font-weight: 900;
  display: grid;
  place-items: center;
  margin-bottom: 16px;
}

.pr-icon--green { background: #00a878; color: #fff; }
.pr-icon--orange { background: #fff5df; color: #e87800; font-size: 32px; }
.pr-icon--red { background: #fde8e8; color: #d92d20; }

.pr-status-title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 950;
  letter-spacing: -0.04em;
}

.pr-status-text {
  margin: 0 0 22px;
  color: #66736e;
  font-size: 14px;
  line-height: 1.5;
}

.pr-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}

.pr-btn {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 20px;
  border-radius: 14px;
  font: inherit;
  font-size: 14px;
  font-weight: 800;
  text-decoration: none;
  cursor: pointer;
  transition: 0.14s;
  border: none;
}

.pr-btn--primary { background: #00a878; color: #fff; }
.pr-btn--primary:hover { background: #008a64; }

.pr-btn--secondary { background: #f3f8f6; color: #263732; border: 1px solid #dde7e2; }
.pr-btn--secondary:hover { background: #e8f2ed; }

.pr-btn--ghost { background: transparent; color: #66736e; border: 1px solid #dde7e2; }
.pr-btn--ghost:hover { color: #263732; background: #f4faf7; }

.pr-details-card {
  max-width: 600px;
  margin: 0 auto;
  background: #fff;
  border: 1px solid #dde7e2;
  border-radius: 24px;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  padding: 22px;
}

.pr-card-title {
  margin: 0 0 14px;
  font-size: 17px;
  font-weight: 950;
  letter-spacing: -0.03em;
}

.pr-detail-list { display: grid; gap: 0; }

.pr-detail {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 14px;
  color: #66736e;
  padding: 10px 0;
  border-bottom: 1px solid #edf2ef;
}

.pr-detail:last-child { border-bottom: none; }
.pr-detail strong { color: #14231f; font-weight: 700; text-align: right; }

@media (max-width: 560px) {
  .pr-page { padding-left: 16px; padding-right: 16px; }
}
</style>
