<script setup lang="ts">
import { computed } from 'vue';
import { formatDate, formatMoney } from '../../i18n/format';

defineProps<{ orderNumber: string }>();

const DEMO_PAYMENT_ID = 'PAY-20260628-009821';
const demoAmount = computed(() => formatMoney(12450));
const today = computed(() =>
    formatDate(Date.now(), {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }),
);
</script>

<template>
    <div class="pr-details-card">
        <h3 class="pr-card-title">{{ $t('paymentResult.details') }}</h3>
        <div class="pr-detail-list">
            <div class="pr-detail">
                <span>{{ $t('paymentResult.paymentId') }}</span
                ><strong>{{ DEMO_PAYMENT_ID }}</strong>
            </div>
            <div class="pr-detail">
                <span>{{ $t('paymentResult.order') }}</span
                ><strong>#{{ orderNumber }}</strong>
            </div>
            <div class="pr-detail">
                <span>{{ $t('paymentResult.amount') }}</span
                ><strong>{{ demoAmount }}</strong>
            </div>
            <div class="pr-detail">
                <span>{{ $t('paymentResult.method') }}</span
                ><strong>{{ $t('paymentResult.online') }}</strong>
            </div>
            <div class="pr-detail">
                <span>{{ $t('orders.date') }}</span
                ><strong>{{ today }}</strong>
            </div>
        </div>
    </div>
</template>

<style scoped>
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

.pr-detail-list {
    display: grid;
    gap: 0;
}

.pr-detail {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 14px;
    color: #66736e;
    padding: 10px 0;
    border-bottom: 1px solid #edf2ef;
}

.pr-detail:last-child {
    border-bottom: none;
}
.pr-detail strong {
    color: #14231f;
    font-weight: 700;
    text-align: right;
}
</style>
