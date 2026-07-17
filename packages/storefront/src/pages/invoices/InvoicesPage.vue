<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { MvPagination } from '@mivend/ui-kit';
import AccountSidebar from '../account/AccountSidebar.vue';
import InvoiceRow from './InvoiceRow.vue';
import { useInvoices, INVOICE_STATUS_LABEL } from './useInvoices';

const { invoices, totalItems, loading, load } = useInvoices();

const PAGE_SIZE = 20;

const activeFilter = ref('all');
const page = ref(1);

const statusFilters = [
    { key: 'all', label: 'All invoices' },
    ...Object.entries(INVOICE_STATUS_LABEL).map(([key, label]) => ({ key, label })),
];

function reload(): void {
    void load({
        take: PAGE_SIZE,
        skip: (page.value - 1) * PAGE_SIZE,
        status: activeFilter.value === 'all' ? undefined : activeFilter.value,
    });
}

watch(activeFilter, () => {
    page.value = 1;
    reload();
});
watch(page, reload);

onMounted(reload);

function formatAmount(cents: number, currency: string): string {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(cents / 100)
        + ' ' + (currency === 'RUB' ? '₽' : currency);
}

const outstandingTotal = computed(() => {
    const byCurrency = new Map<string, number>();
    for (const invoice of invoices.value) {
        if (invoice.status === 'paid' || invoice.status === 'cancelled') continue;
        byCurrency.set(invoice.currencyCode, (byCurrency.get(invoice.currencyCode) ?? 0) + invoice.amount);
    }
    return [...byCurrency.entries()].map(([currency, amount]) => formatAmount(amount, currency)).join(', ') || '—';
});
</script>

<template>
  <div class="invoices-page">
    <AccountSidebar />

    <section class="invoices-page__content">
      <div class="invoices-page__head">
        <div>
          <h1 class="invoices-page__title">Invoices</h1>
          <p class="invoices-page__subtitle">Payment obligations and links to their orders.</p>
        </div>
      </div>

      <div class="invoices-page__stats">
        <div class="invoices-page__stat-card">
          <div class="invoices-page__stat-title">Invoices on this page</div>
          <div class="invoices-page__stat-value">{{ totalItems }}</div>
        </div>
        <div class="invoices-page__stat-card">
          <div class="invoices-page__stat-title">Outstanding (this page)</div>
          <div class="invoices-page__stat-value">{{ outstandingTotal }}</div>
          <div class="invoices-page__stat-note">Excludes paid and cancelled invoices</div>
        </div>
      </div>

      <div class="invoices-page__main">
        <div class="invoices-page__filters">
          <button
            v-for="filter in statusFilters"
            :key="filter.key"
            type="button"
            class="invoices-page__filter"
            :class="{ 'invoices-page__filter--active': activeFilter === filter.key }"
            @click="activeFilter = filter.key"
          >
            {{ filter.label }}
          </button>
        </div>

        <div v-if="loading" class="invoices-page__state">Loading...</div>
        <div v-else-if="!invoices.length" class="invoices-page__state">No invoices found.</div>
        <template v-else>
          <MvPagination :page="page" :page-size="PAGE_SIZE" :total="totalItems" @update:page="page = $event" />
          <div class="invoices-page__list">
            <InvoiceRow v-for="invoice in invoices" :key="invoice.id" :invoice="invoice" />
          </div>
          <MvPagination :page="page" :page-size="PAGE_SIZE" :total="totalItems" @update:page="page = $event" />
        </template>
      </div>
    </section>
  </div>
</template>

<style scoped>
.invoices-page {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  gap: 24px;
  align-items: start;
  max-width: 1440px;
  margin: 0 auto;
  padding: 24px 28px 56px;
}

.invoices-page__content { min-width: 0; }

.invoices-page__head { margin-bottom: 18px; }

.invoices-page__title {
  margin: 0 0 6px;
  font-size: clamp(34px, 3.6vw, 50px);
  line-height: 0.98;
  letter-spacing: -0.055em;
}

.invoices-page__subtitle {
  margin: 0;
  color: #66736e;
  font-size: 14px;
  line-height: 1.45;
}

.invoices-page__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}

.invoices-page__stat-card {
  min-height: 112px;
  background: #fff;
  border: 1px solid rgba(221, 231, 226, 0.86);
  border-radius: 20px;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  padding: 18px;
}

.invoices-page__stat-title {
  color: #66736e;
  font-size: 13px;
  font-weight: 850;
  margin-bottom: 13px;
}

.invoices-page__stat-value {
  font-size: 28px;
  font-weight: 950;
  letter-spacing: -0.055em;
  margin-bottom: 4px;
}

.invoices-page__stat-note {
  color: #66736e;
  font-size: 13px;
  line-height: 1.35;
}

.invoices-page__main {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.invoices-page__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.invoices-page__filter {
  border: 1px solid rgba(221, 231, 226, 0.9);
  border-radius: 999px;
  background: #fff;
  padding: 9px 15px;
  font-weight: 800;
  font-size: 13px;
  color: #263732;
  cursor: pointer;
}

.invoices-page__filter--active {
  background: #008a64;
  color: #fff;
  border-color: #008a64;
}

.invoices-page__state {
  text-align: center;
  padding: 48px 24px;
  color: #66736e;
  font-size: 15px;
}

.invoices-page__list { display: grid; gap: 10px; }

@media (max-width: 960px) {
  .invoices-page {
    grid-template-columns: 1fr;
    padding-left: 16px;
    padding-right: 16px;
  }
  .invoices-page__stats { grid-template-columns: 1fr; }
}
</style>
