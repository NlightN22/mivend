<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvDateTimeCell, MvPanel, MvStatusBadge, formatDocumentNumber } from '@mivend/ui-kit';
import { formatPaymentAmount, type PaymentCardData } from '../../api/payments';
import { refundLabel, refundVariant } from './paymentCardModel';

defineProps<{ payment: PaymentCardData }>();
const { t } = useI18n();
</script>

<template>
    <MvPanel v-if="payment.refunds.length" :title="t('payments.card.refunds')">
        <ol class="payment-refunds">
            <li v-for="refund in payment.refunds" :key="refund.id" class="payment-refunds__item">
                <div class="payment-refunds__head">
                    <strong>{{ formatDocumentNumber(refund.number) }}</strong>
                    <MvStatusBadge :variant="refundVariant(refund.status)">{{
                        refundLabel(refund.status)
                    }}</MvStatusBadge>
                    <span class="payment-refunds__amount">{{
                        formatPaymentAmount(refund.amount, payment.currencyCode)
                    }}</span>
                </div>
                <MvDateTimeCell :value="refund.createdAt" />
                <p v-if="refund.reason" class="payment-refunds__reason">{{ refund.reason }}</p>
            </li>
        </ol>
    </MvPanel>
</template>

<style scoped>
.payment-refunds {
    list-style: none;
    margin: 0;
    padding: 0 0 0 18px;
    border-left: 2px solid var(--app-nav-border-strong);
}

.payment-refunds__item {
    position: relative;
    padding-bottom: 18px;
}

.payment-refunds__item:last-child {
    padding-bottom: 0;
}

.payment-refunds__item::before {
    content: '';
    position: absolute;
    left: -25px;
    top: 5px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--el-color-primary);
}

.payment-refunds__head {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 4px;
}

.payment-refunds__amount {
    margin-left: auto;
    font-weight: 700;
}

.payment-refunds__reason {
    margin: 6px 0 0;
    color: var(--app-text-grey);
    overflow-wrap: anywhere;
}
</style>
