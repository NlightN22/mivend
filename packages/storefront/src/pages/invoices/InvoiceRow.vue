<script setup lang="ts">
import { useRouter } from 'vue-router';
import { MvStatusBadge } from '@mivend/ui-kit';
import MvButton from '@mivend/ui-kit/src/components/MvButton/MvButton.vue';
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_VARIANT, type InvoiceSummary } from './useInvoices';

const props = defineProps<{ invoice: InvoiceSummary }>();
const router = useRouter();

function formatAmount(cents: number, currency: string): string {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(cents / 100)
        + ' ' + (currency === 'RUB' ? '₽' : currency);
}

function openOrder(): void {
    void router.push(`/orders/${props.invoice.order.id}`);
}

function openInvoice(): void {
    void router.push(`/invoices/${props.invoice.id}`);
}

function payInvoice(): void {
    void router.push(`/invoices/${props.invoice.id}/pay`);
}

const isPayable = props.invoice.status !== 'paid' && props.invoice.status !== 'cancelled';
</script>

<template>
  <article class="invoice-row">
    <div>
      <div class="invoice-row__name">Invoice #{{ invoice.id }}</div>
      <div class="invoice-row__meta">Order {{ invoice.order.code }}</div>
    </div>

    <div>
      <div class="invoice-row__cell-title">Amount</div>
      <div class="invoice-row__cell-value">{{ formatAmount(invoice.amount, invoice.currencyCode) }}</div>
    </div>

    <MvStatusBadge :variant="INVOICE_STATUS_VARIANT[invoice.status] ?? 'neutral'">
      {{ INVOICE_STATUS_LABEL[invoice.status] ?? invoice.status }}
    </MvStatusBadge>

    <div class="invoice-row__actions">
      <MvButton variant="secondary" size="sm" @click="openOrder">Order</MvButton>
      <MvButton variant="secondary" size="sm" @click="openInvoice">Open</MvButton>
      <MvButton v-if="isPayable" variant="primary" size="sm" @click="payInvoice">Pay</MvButton>
    </div>
  </article>
</template>

<style scoped>
.invoice-row {
  background: #fff;
  border: 1px solid rgba(221, 231, 226, 0.9);
  border-radius: 22px;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  padding: 16px 18px;
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) 150px 120px 180px;
  gap: 14px;
  align-items: center;
}

.invoice-row__name {
  font-weight: 950;
  letter-spacing: -0.02em;
  margin-bottom: 5px;
  line-height: 1.28;
}

.invoice-row__meta {
  color: #66736e;
  font-size: 13px;
  line-height: 1.35;
}

.invoice-row__cell-title {
  color: #66736e;
  font-size: 12px;
  margin-bottom: 4px;
  font-weight: 850;
}

.invoice-row__cell-value {
  font-size: 14px;
  font-weight: 900;
  line-height: 1.3;
}

.invoice-row__actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

@media (max-width: 960px) {
  .invoice-row {
    grid-template-columns: minmax(0, 1fr) 120px;
  }
  .invoice-row__actions { grid-column: 1 / -1; justify-content: flex-start; }
}

@media (max-width: 640px) {
  .invoice-row { grid-template-columns: 1fr; }
  .invoice-row__actions { grid-column: auto; }
}
</style>
