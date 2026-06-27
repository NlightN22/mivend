<script setup lang="ts">
import AccountSidebar from './AccountSidebar.vue';

const metrics = [
    { label: 'Available limit', value: '420 000 ₽', note: 'Order without upfront payment', variant: 'green' },
    { label: 'Used', value: '486 500 ₽', note: '54% of total credit limit', variant: '' },
    { label: 'Deferral', value: '14 days', note: 'Under main contract', variant: '' },
    { label: 'Due', value: '188 580 ₽', note: 'Next payment by 30.06.2026', variant: 'orange' },
];

const contracts = [
    { title: 'Main contract', note: 'All active trading points', limit: '800 000 ₽', available: '377 140 ₽', deferral: '14 days', status: 'Active', statusVariant: '' },
    { title: 'Additional terms', note: 'One-time shipments on agreed items', limit: '106 500 ₽', available: '42 860 ₽', deferral: '7 days', status: 'Nearly used', statusVariant: 'warning' },
];

const payments = [
    { title: 'Order #348744', note: 'Reservation confirmed · partial payment received', amount: '86 420 ₽', remaining: '21 420 ₽', due: '30.06.2026', status: 'Due', statusVariant: 'warning' },
    { title: 'Order #347611', note: 'Ready for shipment · no payment received', amount: '124 300 ₽', remaining: '124 300 ₽', due: '02.07.2026', status: 'Due', statusVariant: 'warning' },
    { title: 'Order #347982', note: 'Shipped and closed', amount: '18 730 ₽', remaining: '0 ₽', due: 'Paid', status: 'Paid', statusVariant: '' },
];
</script>

<template>
  <div class="bal-page">
    <AccountSidebar />

    <section class="bal-content">
      <div class="bal-head">
        <div>
          <h1 class="bal-title">Balance &amp; Limits</h1>
          <p class="bal-subtitle">Available limit, deferral, debt, upcoming payments and payment initiation.</p>
        </div>
        <div class="bal-head-actions">
          <button class="bal-btn">Reconciliation act</button>
          <button class="bal-btn bal-btn--primary">Ask a question</button>
        </div>
      </div>

      <div class="bal-layout">
        <div class="bal-main">
          <!-- Metric cards -->
          <div class="bal-metrics">
            <div
              v-for="m in metrics"
              :key="m.label"
              class="bal-metric"
              :class="{ 'bal-metric--green': m.variant === 'green', 'bal-metric--orange': m.variant === 'orange' }"
            >
              <div class="bal-metric__label">{{ m.label }}</div>
              <div class="bal-metric__value">{{ m.value }}</div>
              <div class="bal-metric__note">{{ m.note }}</div>
            </div>
          </div>

          <!-- Notice -->
          <div class="bal-notice">
            <span>ℹ️</span>
            <div>
              <strong>Limits are managed by your account manager.</strong>
              Credit limits and payment deferrals are set internally. You can pay, download documents, or create a request.
            </div>
          </div>

          <!-- Limit status -->
          <div class="bal-block">
            <div class="bal-block__head">
              <div>
                <h2 class="bal-block__title">Limit Status</h2>
                <div class="bal-block__sub">Overall limit, used portion and remaining balance for new orders.</div>
              </div>
              <span class="bal-pill">Orders available</span>
            </div>

            <div class="bal-progress-wrap">
              <div class="bal-progress-head">
                <span>Used 486 500 ₽ of 906 500 ₽</span>
                <span>54%</span>
              </div>
              <div class="bal-progress">
                <div class="bal-progress__fill" style="width: 54%"></div>
              </div>
              <div class="bal-progress-foot">
                <span>Available: 420 000 ₽</span>
                <span>Overdue: 0 ₽</span>
              </div>
            </div>

            <div class="bal-table">
              <div v-for="c in contracts" :key="c.title" class="bal-row">
                <div class="bal-row__info">
                  <div class="bal-row__title">{{ c.title }}</div>
                  <div class="bal-row__note">{{ c.note }}</div>
                </div>
                <div class="bal-cell">
                  <div class="bal-cell__label">Limit</div>
                  <div class="bal-cell__value">{{ c.limit }}</div>
                </div>
                <div class="bal-cell">
                  <div class="bal-cell__label">Available</div>
                  <div class="bal-cell__value">{{ c.available }}</div>
                </div>
                <div class="bal-cell">
                  <div class="bal-cell__label">Deferral</div>
                  <div class="bal-cell__value">{{ c.deferral }}</div>
                </div>
                <span class="bal-pill" :class="{ 'bal-pill--warning': c.statusVariant === 'warning' }">{{ c.status }}</span>
              </div>
            </div>
          </div>

          <!-- Payments -->
          <div class="bal-block">
            <div class="bal-block__head">
              <div>
                <h2 class="bal-block__title">Payments &amp; Debt</h2>
                <div class="bal-block__sub">Amounts, due dates and payment statuses.</div>
              </div>
              <button class="bal-btn bal-btn--orange">Pay</button>
            </div>

            <div class="bal-table">
              <div v-for="p in payments" :key="p.title" class="bal-row">
                <div class="bal-row__info">
                  <div class="bal-row__title">{{ p.title }}</div>
                  <div class="bal-row__note">{{ p.note }}</div>
                </div>
                <div class="bal-cell">
                  <div class="bal-cell__label">Amount</div>
                  <div class="bal-cell__value">{{ p.amount }}</div>
                </div>
                <div class="bal-cell">
                  <div class="bal-cell__label">Remaining</div>
                  <div class="bal-cell__value">{{ p.remaining }}</div>
                </div>
                <div class="bal-cell">
                  <div class="bal-cell__label">Due</div>
                  <div class="bal-cell__value">{{ p.due }}</div>
                </div>
                <span class="bal-pill" :class="{ 'bal-pill--warning': p.statusVariant === 'warning' }">{{ p.status }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Right aside -->
        <aside class="bal-aside">
          <div class="bal-panel">
            <div class="bal-panel__title">Payment</div>
            <div class="bal-panel__sub">Pay debt, a specific order, or make an advance.</div>
            <div class="bal-pay">
              <div class="bal-pay__label">Amount due</div>
              <input class="bal-pay__input" value="188 580 ₽" />
              <button class="bal-wide-btn">Proceed to payment</button>
            </div>
            <div class="bal-mini-list">
              <div class="bal-mini-item">
                <div class="bal-mini-title">Advance payment accepted</div>
                <div class="bal-mini-note">The payment will be credited to your balance and allocated internally.</div>
              </div>
              <div class="bal-mini-item">
                <div class="bal-mini-title">Documents</div>
                <div class="bal-mini-note">Invoices, UPD and reconciliation acts are available in the Documents section.</div>
              </div>
            </div>
          </div>

          <div class="bal-panel">
            <div class="bal-panel__title">Next Payment</div>
            <div class="bal-info-line"><span>Amount</span><strong>21 420 ₽</strong></div>
            <div class="bal-info-line"><span>Due date</span><strong>30.06.2026</strong></div>
            <div class="bal-info-line"><span>Order</span><strong>#348744</strong></div>
            <div class="bal-info-line"><span>Overdue</span><strong>0 ₽</strong></div>
            <button class="bal-btn bal-btn--primary" style="width: 100%; margin-top: 14px;">Open order</button>
          </div>

          <div class="bal-panel">
            <div class="bal-panel__title">Restrictions</div>
            <div class="bal-panel__sub">What affects your ability to place orders without upfront payment.</div>
            <div class="bal-mini-list">
              <div class="bal-mini-item">
                <div class="bal-mini-title">Limit nearly exhausted</div>
                <div class="bal-mini-note">If your cart exceeds the available limit, payment or approval request will be required.</div>
              </div>
              <div class="bal-mini-item">
                <div class="bal-mini-title">No overdue debt</div>
                <div class="bal-mini-note">Placing orders against the credit limit is currently available.</div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  </div>
</template>

<style scoped>
.bal-page {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  gap: 24px;
  align-items: start;
  max-width: 1440px;
  margin: 0 auto;
  padding: 24px 28px 56px;
}

.bal-content { min-width: 0; }

.bal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}

.bal-title {
  margin: 0 0 6px;
  font-size: clamp(34px, 3.6vw, 50px);
  line-height: 0.98;
  letter-spacing: -0.055em;
}

.bal-subtitle { margin: 0; color: #66736e; font-size: 14px; }

.bal-head-actions { display: flex; gap: 8px; flex-shrink: 0; }

.bal-btn {
  border: 0;
  border-radius: 12px;
  padding: 0 16px;
  min-height: 40px;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
  white-space: nowrap;
  background: #f3f8f6;
  color: #263732;
  border: 1px solid #dde7e2;
  transition: 0.14s ease;
}
.bal-btn--primary { background: #00a878; color: #fff; border-color: transparent; }
.bal-btn--orange { background: #ff8a00; color: #fff; border-color: transparent; }

.bal-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 20px;
  align-items: start;
}

.bal-main { display: grid; gap: 16px; min-width: 0; }

/* Metrics */
.bal-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.bal-metric {
  background: #fff;
  border: 1px solid #dde7e2;
  border-radius: 20px;
  padding: 16px 18px;
}

.bal-metric--green .bal-metric__value { color: #008a64; }
.bal-metric--orange .bal-metric__value { color: #e87800; }

.bal-metric__label { font-size: 12px; font-weight: 800; color: #a8b8b2; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
.bal-metric__value { font-size: 22px; font-weight: 950; letter-spacing: -0.04em; color: #14231f; margin-bottom: 4px; }
.bal-metric__note { font-size: 12px; color: #66736e; }

/* Notice */
.bal-notice {
  padding: 15px 16px;
  border-radius: 18px;
  border: 1px solid rgba(255, 138, 0, 0.22);
  background: #fff5df;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  color: #573a14;
  font-size: 14px;
  line-height: 1.42;
}
.bal-notice strong { display: block; color: #33210a; margin-bottom: 2px; }

/* Blocks */
.bal-block {
  background: #fff;
  border: 1px solid #dde7e2;
  border-radius: 20px;
  padding: 20px;
}

.bal-block__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}

.bal-block__title { margin: 0 0 4px; font-size: 18px; font-weight: 950; letter-spacing: -0.03em; }
.bal-block__sub { font-size: 13px; color: #66736e; }

/* Progress */
.bal-progress-wrap { margin-bottom: 18px; }
.bal-progress-head { display: flex; justify-content: space-between; font-size: 13px; color: #66736e; font-weight: 700; margin-bottom: 8px; }
.bal-progress { height: 8px; background: #edf2ef; border-radius: 999px; overflow: hidden; }
.bal-progress__fill { height: 100%; background: #00a878; border-radius: 999px; }
.bal-progress-foot { display: flex; justify-content: space-between; font-size: 12px; color: #a8b8b2; font-weight: 700; margin-top: 6px; }

/* Table rows */
.bal-table { display: grid; gap: 8px; }

.bal-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 110px 110px 90px auto;
  gap: 8px;
  align-items: center;
  padding: 12px 14px;
  background: #f7fbf9;
  border: 1px solid #edf2ef;
  border-radius: 14px;
}

.bal-row__title { font-size: 14px; font-weight: 900; color: #14231f; margin-bottom: 2px; }
.bal-row__note { font-size: 12px; color: #66736e; }

.bal-cell__label { font-size: 11px; font-weight: 800; color: #a8b8b2; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 2px; }
.bal-cell__value { font-size: 14px; font-weight: 800; color: #263732; }

/* Pills */
.bal-pill {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
  background: #e2f8ef;
  color: #008a64;
}
.bal-pill--warning { background: #fff5df; color: #a05500; }

/* Aside panels */
.bal-aside { display: grid; gap: 14px; }

.bal-panel {
  background: #fff;
  border: 1px solid #dde7e2;
  border-radius: 20px;
  padding: 18px 20px;
}

.bal-panel__title { font-size: 16px; font-weight: 950; letter-spacing: -0.03em; margin-bottom: 6px; }
.bal-panel__sub { font-size: 13px; color: #66736e; margin-bottom: 14px; line-height: 1.42; }

.bal-pay__label { font-size: 12px; font-weight: 800; color: #66736e; margin-bottom: 6px; }
.bal-pay__input {
  width: 100%;
  border: 1px solid #dde7e2;
  border-radius: 12px;
  padding: 10px 14px;
  font: inherit;
  font-size: 18px;
  font-weight: 950;
  letter-spacing: -0.03em;
  outline: none;
  margin-bottom: 10px;
}

.bal-wide-btn {
  width: 100%;
  min-height: 44px;
  border: 0;
  border-radius: 12px;
  background: #00a878;
  color: #fff;
  font: inherit;
  font-weight: 950;
  cursor: pointer;
  margin-bottom: 14px;
}

.bal-mini-list { display: grid; gap: 10px; border-top: 1px solid #edf2ef; padding-top: 14px; }
.bal-mini-item {}
.bal-mini-title { font-size: 13px; font-weight: 900; color: #14231f; margin-bottom: 3px; }
.bal-mini-note { font-size: 12px; color: #66736e; line-height: 1.4; }

.bal-info-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #edf2ef;
  font-size: 13px;
}
.bal-info-line span { color: #66736e; }
.bal-info-line strong { color: #14231f; font-weight: 900; }

@media (max-width: 1100px) {
  .bal-metrics { grid-template-columns: repeat(2, 1fr); }
  .bal-layout { grid-template-columns: 1fr; }
  .bal-aside { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 960px) {
  .bal-page { grid-template-columns: 1fr; padding-left: 16px; padding-right: 16px; }
  .bal-row { grid-template-columns: 1fr 1fr; }
}

@media (max-width: 640px) {
  .bal-head { flex-direction: column; }
  .bal-metrics { grid-template-columns: 1fr 1fr; }
  .bal-aside { grid-template-columns: 1fr; }
  .bal-row { grid-template-columns: 1fr; }
}
</style>
