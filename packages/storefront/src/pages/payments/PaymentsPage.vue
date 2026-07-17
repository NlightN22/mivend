<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { MvPagination } from '@mivend/ui-kit';
import AccountSidebar from '../account/AccountSidebar.vue';
import PaymentRow from './PaymentRow.vue';
import { usePayments, PAYMENT_STATUS_LABEL, PAYMENT_CHANNEL_LABEL } from './usePayments';
import { shopApi } from '../../api/client';
import { MyAdvanceBalanceDocument } from '../../api/generated/graphql';

const { payments, totalItems, loading, load } = usePayments();

const PAGE_SIZE = 20;
const activeStatus = ref('all');
const activeChannel = ref('all');
const page = ref(1);

const statusFilters = [{ key: 'all', label: 'All statuses' }, ...Object.entries(PAYMENT_STATUS_LABEL).map(([key, label]) => ({ key, label }))];
const channelFilters = [{ key: 'all', label: 'All sources' }, ...Object.entries(PAYMENT_CHANNEL_LABEL).map(([key, label]) => ({ key, label }))];

function reload(): void {
    void load({
        take: PAGE_SIZE,
        skip: (page.value - 1) * PAGE_SIZE,
        status: activeStatus.value === 'all' ? undefined : activeStatus.value,
        channel: activeChannel.value === 'all' ? undefined : activeChannel.value,
    });
}

watch([activeStatus, activeChannel], () => { page.value = 1; reload(); });
watch(page, reload);

function formatAmount(cents: number, currency: string): string {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(cents / 100)
        + ' ' + (currency === 'RUB' ? '₽' : currency);
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        + ' · ' + new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

const receivedThisMonth = computed(() => {
    const now = new Date();
    const byCurrency = new Map<string, number>();
    for (const p of payments.value) {
        const d = new Date(p.createdAt);
        if (p.status !== 'captured') continue;
        if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) continue;
        byCurrency.set(p.currencyCode, (byCurrency.get(p.currencyCode) ?? 0) + p.amount);
    }
    return [...byCurrency.entries()].map(([c, a]) => formatAmount(a, c)).join(', ') || '0 ₽';
});

const pendingTotal = computed(() => {
    const byCurrency = new Map<string, number>();
    for (const p of payments.value) {
        if (p.status !== 'pending' && p.status !== 'authorized') continue;
        byCurrency.set(p.currencyCode, (byCurrency.get(p.currencyCode) ?? 0) + p.amount);
    }
    return [...byCurrency.entries()].map(([c, a]) => formatAmount(a, c)).join(', ') || '0 ₽';
});

const refundedTotal = computed(() => {
    const byCurrency = new Map<string, number>();
    for (const p of payments.value) {
        const refunded = (p.refunds ?? []).filter(r => r.status === 'succeeded').reduce((s, r) => s + r.amount, 0);
        if (refunded > 0) byCurrency.set(p.currencyCode, (byCurrency.get(p.currencyCode) ?? 0) + refunded);
    }
    return [...byCurrency.entries()].map(([c, a]) => formatAmount(a, c)).join(', ') || '0 ₽';
});

const advanceBalances = ref<{ amount: number; currencyCode: string }[]>([]);
const advanceTotal = computed(() =>
    advanceBalances.value.map(a => formatAmount(a.amount, a.currencyCode)).join(', ') || '0 ₽',
);

onMounted(async () => {
    reload();
    const result = await shopApi(MyAdvanceBalanceDocument, {});
    advanceBalances.value = result.myAdvanceBalance;
});
</script>

<template>
  <div class="payments-page">
    <AccountSidebar />

    <section class="payments-page__content">
      <div class="payments-page__head">
        <div>
          <h1 class="payments-page__title">Payments</h1>
          <p class="payments-page__subtitle">Track incoming payments, their source, status and allocation across invoices.</p>
        </div>
      </div>

      <div class="payments-page__stats">
        <div class="payments-page__stat-card payments-page__stat-card--success">
          <div class="payments-page__stat-title">Received this month</div>
          <div class="payments-page__stat-value">{{ receivedThisMonth }}</div>
        </div>
        <div class="payments-page__stat-card">
          <div class="payments-page__stat-title">Advance balance</div>
          <div class="payments-page__stat-value">{{ advanceTotal }}</div>
        </div>
        <div class="payments-page__stat-card payments-page__stat-card--warn">
          <div class="payments-page__stat-title">Pending</div>
          <div class="payments-page__stat-value">{{ pendingTotal }}</div>
        </div>
        <div class="payments-page__stat-card">
          <div class="payments-page__stat-title">Refunded</div>
          <div class="payments-page__stat-value">{{ refundedTotal }}</div>
        </div>
      </div>

      <div class="payments-page__main">
        <div class="payments-page__filters">
          <button
            v-for="f in statusFilters"
            :key="f.key"
            type="button"
            class="payments-page__filter"
            :class="{ 'payments-page__filter--active': activeStatus === f.key }"
            @click="activeStatus = f.key"
          >
            {{ f.label }}
          </button>
        </div>
        <div class="payments-page__filters">
          <button
            v-for="f in channelFilters"
            :key="f.key"
            type="button"
            class="payments-page__filter payments-page__filter--source"
            :class="{ 'payments-page__filter--active': activeChannel === f.key }"
            @click="activeChannel = f.key"
          >
            {{ f.label }}
          </button>
        </div>

        <div v-if="loading" class="payments-page__state">Loading...</div>
        <div v-else-if="!payments.length" class="payments-page__state">No payments found.</div>
        <template v-else>
          <MvPagination :page="page" :page-size="PAGE_SIZE" :total="totalItems" @update:page="page = $event" />
          <div class="payments-page__list">
            <PaymentRow v-for="p in payments" :key="p.id" :payment="p" :format-amount="formatAmount" :format-date="formatDate" />
          </div>
          <MvPagination :page="page" :page-size="PAGE_SIZE" :total="totalItems" @update:page="page = $event" />
        </template>
      </div>

      <div class="payments-page__legend">
        <div>
          <h3>What this page shows</h3>
          <p>Payments are money movements. A payment may settle one invoice, several invoices, or remain partly unapplied as advance balance. Invoice pages remain the source of truth for obligations.</p>
        </div>
        <div>
          <h3>Payment sources</h3>
          <p>Online acquiring, branch cash desk, and bank transfers reported by the ERP — regardless of the underlying channel, cash application applies the same way.</p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.payments-page {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  gap: 24px;
  align-items: start;
  max-width: 1440px;
  margin: 0 auto;
  padding: 24px 28px 56px;
}

.payments-page__content { min-width: 0; }
.payments-page__head { margin-bottom: 18px; }

.payments-page__title {
  margin: 0 0 6px;
  font-size: clamp(34px, 3.6vw, 50px);
  line-height: 0.98;
  letter-spacing: -0.055em;
}

.payments-page__subtitle { margin: 0; color: #66736e; font-size: 14px; line-height: 1.45; }

.payments-page__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}

.payments-page__stat-card {
  min-height: 100px;
  background: #fff;
  border: 1px solid rgba(221, 231, 226, 0.86);
  border-radius: 20px;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  padding: 18px;
}

.payments-page__stat-card--success .payments-page__stat-value { color: #067a5b; }
.payments-page__stat-card--warn .payments-page__stat-value { color: #b86500; }
.payments-page__stat-card--mock { background: #fbfbfa; }

.payments-page__stat-title {
  color: #66736e;
  font-size: 13px;
  font-weight: 850;
  margin-bottom: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.payments-page__mock-tag {
  background: #eef1ef;
  color: #7a877f;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}

.payments-page__stat-value { font-size: 26px; font-weight: 950; letter-spacing: -0.04em; }
.payments-page__stat-note { color: #8a968f; font-size: 12px; margin-top: 4px; }

.payments-page__main { display: grid; gap: 16px; min-width: 0; }
.payments-page__filters { display: flex; flex-wrap: wrap; gap: 8px; }

.payments-page__filter {
  border: 1px solid rgba(221, 231, 226, 0.9);
  border-radius: 999px;
  background: #fff;
  padding: 8px 14px;
  font-weight: 800;
  font-size: 13px;
  color: #263732;
  cursor: pointer;
}

.payments-page__filter--source { font-size: 12px; padding: 7px 12px; }
.payments-page__filter--active { background: #008a64; color: #fff; border-color: #008a64; }

.payments-page__state { text-align: center; padding: 48px 24px; color: #66736e; font-size: 15px; }
.payments-page__list { display: grid; gap: 10px; }

.payments-page__legend {
  margin-top: 20px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
  background: #fff;
  border: 1px solid rgba(221, 231, 226, 0.86);
  border-radius: 20px;
  padding: 18px;
}

.payments-page__legend h3 { margin: 0 0 8px; font-size: 15px; }
.payments-page__legend p { margin: 0; color: #596971; font-size: 13px; line-height: 1.5; }

@media (max-width: 960px) {
  .payments-page { grid-template-columns: 1fr; padding-left: 16px; padding-right: 16px; }
  .payments-page__stats { grid-template-columns: 1fr 1fr; }
  .payments-page__legend { grid-template-columns: 1fr; }
}
</style>
