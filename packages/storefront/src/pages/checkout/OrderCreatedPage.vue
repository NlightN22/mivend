<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const method = computed(() => (route.query.method === 'deferred' ? 'deferred' : 'invoice'));

const paymentLabel = computed(() =>
    method.value === 'deferred' ? 'Deferred payment' : 'Bank invoice',
);

const statusText = computed(() =>
    method.value === 'deferred'
        ? 'Your order #348744 has been created and will be processed under your deferred payment terms.'
        : 'Your order #348744 has been created. Download the invoice and pay via your bank. The order will be reserved once payment is received.',
);

const steps = computed(() =>
    method.value === 'deferred'
        ? [
              'Your order is queued for processing.',
              'Goods will be reserved.',
              "You'll get a notification when the order is ready.",
          ]
        : [
              'Download and send the invoice to your bank.',
              "We'll reserve the goods when payment arrives.",
              "You'll get a notification when the order is ready.",
          ],
);

const today = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
}).format(new Date());
</script>

<template>
  <main class="oc-page">
    <MvBreadcrumbs
      class="oc-crumbs"
      :items="[{ label: 'Cart', to: '/cart' }, { label: 'Checkout', to: '/checkout' }, { label: 'Order placed' }]"
    />

    <div class="oc-head">
      <h1 class="oc-title">Order placed</h1>
    </div>

    <div class="oc-status-card">
      <div class="oc-check">✓</div>
      <h2 class="oc-status-title">Order created</h2>
      <p class="oc-status-text">{{ statusText }}</p>
      <div class="oc-actions">
        <RouterLink to="/orders" class="oc-btn oc-btn--primary">Open order</RouterLink>
        <a v-if="method === 'invoice'" href="#" class="oc-btn oc-btn--secondary">Download invoice</a>
        <RouterLink to="/catalog" class="oc-btn oc-btn--ghost">Continue shopping</RouterLink>
      </div>
    </div>

    <div class="oc-details-grid">
      <div class="oc-card">
        <h3 class="oc-card-title">Order details</h3>
        <div class="oc-detail-list">
          <div class="oc-detail"><span>Order number</span><strong>#348744</strong></div>
          <div class="oc-detail"><span>Date</span><strong>{{ today }}</strong></div>
          <div class="oc-detail"><span>Trading point</span><strong>Industrial St, 14</strong></div>
          <div class="oc-detail"><span>Payment method</span><strong>{{ paymentLabel }}</strong></div>
          <div class="oc-detail"><span>Delivery</span><strong>Pickup</strong></div>
        </div>
      </div>

      <div class="oc-card">
        <h3 class="oc-card-title">What's next</h3>
        <ol class="oc-steps">
          <li v-for="(step, i) in steps" :key="i" class="oc-step">
            <span class="oc-step-num">{{ i + 1 }}</span>
            <span>{{ step }}</span>
          </li>
        </ol>
      </div>
    </div>
  </main>
</template>

<style scoped>
.oc-page {
  max-width: 1440px;
  margin: 0 auto;
  padding: 24px 28px 70px;
}

.oc-crumbs { margin-bottom: 12px; }

.oc-head { margin-bottom: 24px; }

.oc-title {
  margin: 0;
  font-size: clamp(36px, 3.8vw, 54px);
  line-height: 0.98;
  letter-spacing: -0.06em;
}

.oc-status-card {
  max-width: 600px;
  margin: 0 auto 24px;
  background: #fff;
  border: 1.5px solid #00a878;
  border-radius: 28px;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  padding: 36px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.oc-check {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: #00a878;
  color: #fff;
  font-size: 28px;
  font-weight: 900;
  display: grid;
  place-items: center;
  margin-bottom: 16px;
}

.oc-status-title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 950;
  letter-spacing: -0.04em;
}

.oc-status-text {
  margin: 0 0 22px;
  color: #66736e;
  font-size: 14px;
  line-height: 1.5;
}

.oc-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}

.oc-btn {
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

.oc-btn--primary { background: #00a878; color: #fff; }
.oc-btn--primary:hover { background: #008a64; }

.oc-btn--secondary { background: #f3f8f6; color: #263732; border: 1px solid #dde7e2; }
.oc-btn--secondary:hover { background: #e8f2ed; }

.oc-btn--ghost { background: transparent; color: #66736e; border: 1px solid #dde7e2; }
.oc-btn--ghost:hover { color: #263732; background: #f4faf7; }

.oc-details-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  max-width: 900px;
  margin: 0 auto;
}

.oc-card {
  background: #fff;
  border: 1px solid #dde7e2;
  border-radius: 24px;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  padding: 22px;
}

.oc-card-title {
  margin: 0 0 14px;
  font-size: 17px;
  font-weight: 950;
  letter-spacing: -0.03em;
}

.oc-detail-list { display: grid; gap: 10px; }

.oc-detail {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 14px;
  color: #66736e;
  padding-bottom: 10px;
  border-bottom: 1px solid #edf2ef;
}

.oc-detail:last-child { border-bottom: none; padding-bottom: 0; }

.oc-detail strong { color: #14231f; font-weight: 700; text-align: right; }

.oc-steps { margin: 0; padding: 0; list-style: none; display: grid; gap: 14px; }

.oc-step {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  font-size: 14px;
  color: #263732;
  line-height: 1.4;
}

.oc-step-num {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #e2f8ef;
  color: #008a64;
  font-size: 13px;
  font-weight: 900;
  display: grid;
  place-items: center;
}

@media (max-width: 760px) {
  .oc-details-grid { grid-template-columns: 1fr; }
  .oc-page { padding-left: 16px; padding-right: 16px; }
}
</style>
