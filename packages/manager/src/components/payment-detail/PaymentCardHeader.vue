<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { formatDate } from '../../i18n/format';
import { MvCopyButton, MvStatusBadge, formatDocumentNumber } from '@mivend/ui-kit';
import type { PaymentCardData } from '../../api/payments';
import { channelLabel, listLinkFor, statusLabel, statusVariant } from './paymentCardModel';

defineProps<{ payment: PaymentCardData; amount: string }>();
const { t } = useI18n();
</script>

<template>
    <header class="payment-card-header">
        <div class="payment-card-header__breadcrumb">
            <RouterLink to="/payments">{{ t('payments.card.breadcrumb') }}</RouterLink> /
            {{ formatDocumentNumber(payment.number) }}
        </div>
        <div class="payment-card-header__row">
            <h1 class="payment-card-header__title">
                {{ formatDocumentNumber(payment.number) }}
                <MvStatusBadge :variant="statusVariant(payment.paymentStatus)">{{
                    statusLabel(payment.paymentStatus)
                }}</MvStatusBadge>
            </h1>
            <div class="payment-card-header__actions">
                <MvCopyButton :value="payment.number" :label="t('payments.card.copyNumber')" />
                <RouterLink class="payment-card-header__action" :to="listLinkFor(payment)"
                    >{{ t('payments.card.showInList') }}</RouterLink
                >
                <RouterLink
                    v-if="payment.order"
                    class="payment-card-header__action"
                    :to="`/orders/${payment.order.code}`"
                    >{{ t('payments.card.openOrder') }}</RouterLink
                >
            </div>
        </div>
        <p class="payment-card-header__subtitle">
            <strong>{{ amount }}</strong> · {{ channelLabel(payment.channel) }} ·
            {{ t('payments.card.created', { date: formatDate(payment.createdAt) }) }}
        </p>
    </header>
</template>

<style scoped>
.payment-card-header__breadcrumb {
    color: var(--app-text-grey);
    font-size: 13px;
    margin-bottom: 6px;
}

.payment-card-header__breadcrumb a {
    color: inherit;
    text-decoration: none;
}

.payment-card-header__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
}

.payment-card-header__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}

.payment-card-header__actions {
    display: flex;
    align-items: center;
    gap: 8px;
}

.payment-card-header__action {
    display: inline-flex;
    align-items: center;
    height: 34px;
    padding: 0 12px;
    border: 1px solid var(--app-nav-border-strong);
    border-radius: 10px;
    background: var(--app-surface);
    color: var(--app-text-body2);
    font-size: 13px;
    text-decoration: none;
}

.payment-card-header__action:hover,
.payment-card-header__action:focus-visible {
    border-color: var(--el-color-primary);
    color: var(--app-nav-accent);
}

.payment-card-header__subtitle {
    margin: 8px 0 0;
    color: var(--app-text-grey);
}

@media (max-width: 800px) {
    .payment-card-header__breadcrumb {
        display: none;
    }

    .payment-card-header__title {
        font-size: 22px;
    }
}
</style>
