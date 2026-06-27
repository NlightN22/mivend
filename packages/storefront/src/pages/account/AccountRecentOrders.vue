<script setup lang="ts">
const orders = [
    { number: '348921', date: 'Today, 14:28', address: 'North Hwy, 12', amount: '42 860 ₽', status: 'Awaiting ERP', statusType: 'warning', items: 7, actions: ['Open', 'Repeat'] },
    { number: '348744', date: 'Yesterday, 17:12', address: 'Mira St, 85', amount: '18 940 ₽', status: 'Reserve confirmed', statusType: 'success', items: 4, actions: ['Open', 'Documents'] },
    { number: '348510', date: 'Jun 24', address: 'North Hwy, 12', amount: '96 300 ₽', status: 'Shipped', statusType: 'muted', items: 18, actions: ['Open', 'Repeat'] },
] as const;
</script>

<template>
  <div class="recent-orders">
    <div class="recent-orders__header">
      <div>
        <h2 class="recent-orders__title">Recent Orders</h2>
        <div class="recent-orders__subtitle">Short working list, details open separately.</div>
      </div>
      <RouterLink to="/orders" class="recent-orders__link-more">All orders</RouterLink>
    </div>

    <div class="recent-orders__list">
      <div v-for="order in orders" :key="order.number" class="recent-orders__row">
        <div>
          <div class="recent-orders__number">Order #{{ order.number }}</div>
          <div class="recent-orders__meta">{{ order.date }} · {{ order.address }}</div>
        </div>
        <div class="recent-orders__amount">{{ order.amount }}</div>
        <div>
          <span class="recent-orders__pill" :class="`recent-orders__pill--${order.statusType}`">
            {{ order.status }}
          </span>
        </div>
        <div class="recent-orders__meta">{{ order.items }} items</div>
        <div class="recent-orders__actions">
          <button v-for="action in order.actions" :key="action" class="recent-orders__btn" :class="{ 'recent-orders__btn--primary': action === 'Open' }">
            {{ action }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.recent-orders {
  background: #fff;
  border-radius: 28px;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  border: 1px solid rgba(221, 231, 226, 0.86);
  padding: 22px;
  margin-bottom: 22px;
}

.recent-orders__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}

.recent-orders__title {
  margin: 0 0 5px;
  font-size: 26px;
  letter-spacing: -0.045em;
}

.recent-orders__subtitle {
  color: #66736e;
  font-size: 14px;
  line-height: 1.45;
}

.recent-orders__link-more {
  color: #008a64;
  font-weight: 950;
  font-size: 14px;
  white-space: nowrap;
  text-decoration: none;
}

.recent-orders__list { display: grid; gap: 10px; }

.recent-orders__row {
  min-height: 76px;
  display: grid;
  grid-template-columns: minmax(160px, 1.1fr) 130px 170px 140px 120px;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid #edf2ef;
  border-radius: 18px;
  background: #fbfdfc;
}

.recent-orders__number {
  font-weight: 950;
  margin-bottom: 4px;
  letter-spacing: -0.02em;
}

.recent-orders__meta {
  color: #66736e;
  font-size: 13px;
  line-height: 1.32;
}

.recent-orders__amount {
  font-size: 18px;
  font-weight: 950;
  letter-spacing: -0.035em;
}

.recent-orders__pill {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 950;
  white-space: nowrap;
}

.recent-orders__pill--success { background: #e2f8ef; color: #008a64; }
.recent-orders__pill--muted { background: #eef4f1; color: #5f6e68; }
.recent-orders__pill--warning { background: #fff4e3; color: #a45e00; }

.recent-orders__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.recent-orders__btn {
  border: 0;
  min-height: 38px;
  border-radius: 12px;
  padding: 0 13px;
  background: #f3f8f6;
  color: #263732;
  font-weight: 950;
  cursor: pointer;
  font: inherit;
}

.recent-orders__btn--primary {
  background: #00a878;
  color: #fff;
}

@media (max-width: 1240px) {
  .recent-orders__row {
    grid-template-columns: 1.2fr 120px 150px 120px;
  }
  .recent-orders__actions { grid-column: 1 / -1; justify-content: flex-start; }
}

@media (max-width: 960px) {
  .recent-orders__row { grid-template-columns: 1fr; }
}
</style>
