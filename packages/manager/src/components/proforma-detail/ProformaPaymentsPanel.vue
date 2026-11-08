<script setup lang="ts">
import { computed } from 'vue';
import { MvDateTimeCell, MvPanel, MvStatusBadge } from '@mivend/ui-kit';
import { PAYMENT_STATUS_LABEL, type ProformaCard } from '../../api/proformaInvoiceCard';
import { documentMoney } from '../../utils/documentMoney';
import { paymentSummary } from '../../utils/proformaPayments';

const props = defineProps<{ card: ProformaCard }>();
const money = computed(() => documentMoney(props.card.currencyCode));
const summary = computed(() => paymentSummary(props.card.amount, props.card.payments));
</script>

<template>
    <MvPanel title="Payments" data-testid="proforma-payments">
        <p v-if="!card.payments.length" class="pf-payments__empty">
            No payments applied to this proforma invoice.
        </p>
        <ul v-else class="pf-payments__list">
            <li v-for="payment in card.payments" :key="payment.id" class="pf-payments__item">
                <div class="pf-payments__main">
                    <RouterLink
                        :to="{ path: '/payments', query: { search: payment.number } }"
                        class="pf-payments__number"
                    >
                        № {{ payment.number }}
                    </RouterLink>
                    <MvStatusBadge
                        :variant="payment.paymentStatus === 'captured' ? 'success' : 'neutral'"
                    >
                        {{ PAYMENT_STATUS_LABEL[payment.paymentStatus] ?? payment.paymentStatus }}
                    </MvStatusBadge>
                    <strong class="pf-payments__amount">{{ money(payment.amount) }}</strong>
                </div>
                <span class="pf-payments__meta"><MvDateTimeCell :value="payment.createdAt" /></span>
            </li>
        </ul>
        <dl class="pf-payments__summary">
            <div>
                <dt>Paid</dt>
                <dd data-testid="proforma-paid">{{ money(summary.paid) }}</dd>
            </div>
            <div v-if="card.displayStatus === 'current'">
                <dt>Remaining</dt>
                <dd data-testid="proforma-remaining">{{ money(summary.remaining) }}</dd>
            </div>
        </dl>
        <p class="pf-payments__note">
            Informational: the debt is taken from the ERP sales invoice.
        </p>
    </MvPanel>
</template>

<style scoped>
.pf-payments__empty,
.pf-payments__note {
    margin: 0;
    color: var(--app-text-grey);
    font-size: 13px;
}

.pf-payments__list {
    margin: 0 0 8px;
    padding: 0;
    list-style: none;
}

.pf-payments__item {
    display: grid;
    gap: 2px;
    padding: 8px 0;
    border-bottom: 1px solid var(--app-row-border);
}

.pf-payments__main {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}

.pf-payments__number {
    color: var(--el-color-primary-dark-2);
    font-weight: 700;
    text-decoration: none;
}

.pf-payments__amount {
    margin-left: auto;
}

.pf-payments__meta {
    color: var(--app-text-grey);
    font-size: 12px;
}

.pf-payments__summary {
    display: flex;
    gap: 24px;
    margin: 10px 0 6px;
}

.pf-payments__summary dt {
    color: var(--app-text-grey);
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
}

.pf-payments__summary dd {
    margin: 0;
    font-size: 15px;
    font-weight: 800;
}
</style>
