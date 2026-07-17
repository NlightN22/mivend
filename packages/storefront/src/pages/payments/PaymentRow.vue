<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { MvStatusBadge } from '@mivend/ui-kit';
import MvButton from '@mivend/ui-kit/src/components/MvButton/MvButton.vue';
import {
    PAYMENT_STATUS_LABEL,
    PAYMENT_STATUS_VARIANT,
    PAYMENT_CHANNEL_LABEL,
    type PaymentSummary,
} from './usePayments';

const props = defineProps<{
    payment: PaymentSummary;
    formatAmount: (cents: number, currency: string) => string;
    formatDate: (iso: string) => string;
}>();
const router = useRouter();

function openPayment(): void {
    void router.push(`/payments/${props.payment.id}`);
}

const invoiceAllocations = computed(() => props.payment.allocations.filter(a => !a.isAdvance));
const remaining = computed(() => {
    const advance = props.payment.allocations.find(a => a.isAdvance);
    return advance ? advance.amount : 0;
});
</script>

<template>
  <article class="payment-row">
    <div>
      <div class="payment-row__name">PAY-{{ payment.id }}</div>
      <div class="payment-row__meta" v-if="payment.order">Order {{ payment.order.code }}</div>
    </div>

    <div>
      <div class="payment-row__cell-title">Date</div>
      <div class="payment-row__cell-value">{{ formatDate(payment.createdAt) }}</div>
    </div>

    <div>
      <div class="payment-row__cell-title">Amount</div>
      <div class="payment-row__cell-value">{{ formatAmount(payment.amount, payment.currencyCode) }}</div>
    </div>

    <MvStatusBadge :variant="PAYMENT_STATUS_VARIANT[payment.status] ?? 'neutral'">
      {{ PAYMENT_STATUS_LABEL[payment.status] ?? payment.status }}
    </MvStatusBadge>

    <div>
      <div class="payment-row__cell-title">Source</div>
      <div class="payment-row__source">
        <span class="payment-row__dot" :class="`payment-row__dot--${payment.channel}`"></span>
        {{ PAYMENT_CHANNEL_LABEL[payment.channel] ?? payment.channel }}
      </div>
    </div>

    <div>
      <div class="payment-row__cell-title">Applied to</div>
      <div class="payment-row__chips">
        <span v-if="!invoiceAllocations.length" class="payment-row__muted">—</span>
        <span v-for="(a, i) in invoiceAllocations" :key="i" class="payment-row__chip">
          Invoice #{{ a.invoice?.id }}
        </span>
      </div>
    </div>

    <div>
      <div class="payment-row__cell-title">Remaining</div>
      <div class="payment-row__cell-value payment-row__remaining">{{ formatAmount(remaining, payment.currencyCode) }}</div>
    </div>

    <MvButton variant="secondary" size="sm" @click="openPayment">Open</MvButton>
  </article>
</template>

<style scoped>
.payment-row {
  background: #fff;
  border: 1px solid rgba(221, 231, 226, 0.9);
  border-radius: 22px;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  padding: 16px 18px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 110px 110px 100px 130px minmax(0, 1fr) 100px auto;
  gap: 14px;
  align-items: center;
}

.payment-row__name { font-weight: 950; letter-spacing: -0.02em; margin-bottom: 5px; }
.payment-row__meta { color: #66736e; font-size: 13px; }
.payment-row__cell-title { color: #66736e; font-size: 12px; margin-bottom: 4px; font-weight: 850; }
.payment-row__cell-value { font-size: 14px; font-weight: 850; }
.payment-row__muted { color: #a3aca6; }

.payment-row__source { display: flex; align-items: center; gap: 6px; font-weight: 800; font-size: 13px; }
.payment-row__dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.payment-row__dot--online-acquiring { background: #08ad7b; }
.payment-row__dot--branch-kassa { background: #ff8900; }
.payment-row__dot--bank-transfer-erp { background: #2474d8; }

.payment-row__chips { display: flex; flex-wrap: wrap; gap: 6px; }
.payment-row__chip {
  border: 1px solid #d6e3df;
  background: #f6faf8;
  color: #0c795c;
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 850;
}

@media (max-width: 1180px) {
  .payment-row { grid-template-columns: 1fr 1fr; }
}
</style>
