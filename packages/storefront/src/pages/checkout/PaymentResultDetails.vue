<script setup lang="ts">
import { computed } from 'vue';
import { formatDocumentNumber } from '@mivend/ui-kit';
import { formatDate, formatMoney } from '../../i18n/format';
import { paymentMethodLabel } from '../../utils/orderCreatedText';
import type { PaymentResultView } from '../../utils/paymentResultView';

const props = defineProps<{ view: PaymentResultView }>();

const amount = computed(() => formatMoney(props.view.amountKopecks / 100));
const method = computed(() => (props.view.method ? paymentMethodLabel(props.view.method) : null));
const paidAt = computed(() =>
    props.view.paidAt
        ? formatDate(props.view.paidAt, {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
          })
        : null,
);
</script>

<template>
    <div class="pr-details-card">
        <h3 class="pr-card-title">{{ $t('paymentResult.details') }}</h3>
        <div class="pr-detail-list">
            <div v-if="view.transactionId" class="pr-detail">
                <span>{{ $t('paymentResult.paymentId') }}</span
                ><strong>{{ view.transactionId }}</strong>
            </div>
            <div class="pr-detail">
                <span>{{ $t('paymentResult.order') }}</span
                ><strong>{{ formatDocumentNumber(view.orderNumber) }}</strong>
            </div>
            <div class="pr-detail">
                <span>{{ $t('paymentResult.amount') }}</span
                ><strong>{{ amount }}</strong>
            </div>
            <div v-if="method" class="pr-detail">
                <span>{{ $t('paymentResult.method') }}</span
                ><strong>{{ method }}</strong>
            </div>
            <div v-if="paidAt" class="pr-detail">
                <span>{{ $t('orders.date') }}</span
                ><strong>{{ paidAt }}</strong>
            </div>
        </div>
    </div>
</template>

<style scoped>
.pr-details-card {
    max-width: 600px;
    margin: 0 auto;
    background: var(--app-surface);
    border: 1px solid var(--app-nav-border-strong);
    border-radius: 24px;
    box-shadow: 0 14px 36px var(--app-ink-08);
    padding: 22px;
}

.pr-card-title {
    margin: 0 0 14px;
    font-size: 17px;
    font-weight: 950;
    letter-spacing: -0.03em;
}

.pr-detail-list {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
}

.pr-detail {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 14px;
    color: var(--app-nav-label);
    padding: 10px 0;
    border-bottom: 1px solid var(--app-nav-border);
}

.pr-detail:last-child {
    border-bottom: none;
}
.pr-detail strong {
    color: var(--app-nav-text-strong);
    font-weight: 700;
    text-align: right;
}
</style>
