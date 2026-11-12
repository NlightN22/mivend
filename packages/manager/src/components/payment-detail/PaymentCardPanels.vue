<script setup lang="ts">
import { formatDate } from '../../i18n/format';
import { MvDateTimeCell, MvPanel, MvStatusBadge, formatDocumentNumber } from '@mivend/ui-kit';
import { formatPaymentAmount, type PaymentCardData } from '../../api/payments';
import {
    channelLabel,
    orderStateLabel,
    orderStateVariant,
    proformaLinkFor,
    proformaStatusLabel,
    proformaStatusVariant,
    statusLabel,
    statusVariant,
} from './paymentCardModel';

defineProps<{ payment: PaymentCardData }>();
</script>

<template>
    <div class="payment-card-panels">
        <MvPanel title="Payment">
            <dl class="payment-card-panels__list">
                <dt>Amount</dt>
                <dd>{{ formatPaymentAmount(payment.amount, payment.currencyCode) }}</dd>
                <dt>Currency</dt>
                <dd>{{ payment.currencyCode }}</dd>
                <dt>Status</dt>
                <dd>
                    <MvStatusBadge :variant="statusVariant(payment.paymentStatus)">{{
                        statusLabel(payment.paymentStatus)
                    }}</MvStatusBadge>
                </dd>
                <dt>Source</dt>
                <dd>{{ channelLabel(payment.channel) }}</dd>
                <dt>Provider reference</dt>
                <dd class="payment-card-panels__mono">{{ payment.providerPaymentId }}</dd>
                <dt>Created</dt>
                <dd><MvDateTimeCell :value="payment.createdAt" /></dd>
            </dl>
        </MvPanel>

        <MvPanel title="Customer">
            <dl v-if="payment.customer" class="payment-card-panels__list">
                <dt>Name</dt>
                <dd>
                    <RouterLink :to="`/customers/${payment.customer.id}`">{{
                        payment.customer.shortName ?? '—'
                    }}</RouterLink>
                </dd>
                <dt>INN</dt>
                <dd>{{ payment.customer.inn ?? '—' }}</dd>
            </dl>
            <p v-else class="payment-card-panels__empty">No customer</p>
        </MvPanel>

        <MvPanel title="Proforma invoice">
            <dl v-if="payment.proformaInvoice" class="payment-card-panels__list">
                <dt>Number</dt>
                <dd>
                    <RouterLink :to="proformaLinkFor(payment.proformaInvoice.number)">{{
                        formatDocumentNumber(payment.proformaInvoice.number)
                    }}</RouterLink>
                </dd>
                <dt>Version</dt>
                <dd>{{ payment.proformaInvoice.version }}</dd>
                <dt>Amount</dt>
                <dd>
                    {{
                        formatPaymentAmount(
                            payment.proformaInvoice.amount,
                            payment.proformaInvoice.currencyCode,
                        )
                    }}
                </dd>
                <dt>Due date</dt>
                <dd>{{ formatDate(payment.proformaInvoice.dueDate) }}</dd>
                <dt>Status</dt>
                <dd>
                    <MvStatusBadge
                        :variant="proformaStatusVariant(payment.proformaInvoice.displayStatus)"
                        >{{
                            proformaStatusLabel(payment.proformaInvoice.displayStatus)
                        }}</MvStatusBadge
                    >
                </dd>
            </dl>
            <p v-else class="payment-card-panels__empty">No proforma invoice</p>
        </MvPanel>

        <MvPanel title="Order">
            <dl v-if="payment.order" class="payment-card-panels__list">
                <dt>Number</dt>
                <dd>
                    <RouterLink :to="`/orders/${payment.order.code}`">{{
                        formatDocumentNumber(payment.order.code)
                    }}</RouterLink>
                </dd>
                <dt>Status</dt>
                <dd>
                    <MvStatusBadge :variant="orderStateVariant(payment.order.state)">{{
                        orderStateLabel(payment.order.state)
                    }}</MvStatusBadge>
                </dd>
                <dt>Total</dt>
                <dd>
                    {{ formatPaymentAmount(payment.order.orderTotal, payment.order.currencyCode) }}
                </dd>
            </dl>
            <p v-else class="payment-card-panels__empty">No order</p>
        </MvPanel>
    </div>
</template>

<style scoped>
.payment-card-panels {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 18px;
    align-items: start;
}

.payment-card-panels__list {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 10px 20px;
    margin: 0;
}

.payment-card-panels__list dt {
    color: var(--app-text-grey);
}

.payment-card-panels__list dd {
    margin: 0;
    overflow-wrap: anywhere;
}

.payment-card-panels__list a {
    color: inherit;
    font-weight: 700;
    text-decoration: none;
}

.payment-card-panels__list a:hover,
.payment-card-panels__list a:focus-visible {
    text-decoration: underline;
}

.payment-card-panels__mono {
    font-family: ui-monospace, monospace;
    font-size: 13px;
}

.payment-card-panels__empty {
    margin: 0;
    color: var(--app-text-grey);
}

@media (max-width: 800px) {
    .payment-card-panels {
        grid-template-columns: 1fr;
    }
}
</style>
