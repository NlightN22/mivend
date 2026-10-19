<script setup lang="ts">
import { formatMoney } from './formatMoney';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { MvStatusBadge, formatDocumentNumber } from '@mivend/ui-kit';
import ProformaInvoiceVersionBadge from './ProformaInvoiceVersionBadge.vue';
import { formatDate } from './formatDate';
import MvButton from '@mivend/ui-kit/src/components/MvButton/MvButton.vue';
import {
    proformaInvoiceStatusLabel,
    PROFORMA_INVOICE_STATUS_VARIANT,
    type ProformaInvoiceSummary,
} from './useProformaInvoices';

const props = defineProps<{ proformaInvoice: ProformaInvoiceSummary }>();
const router = useRouter();
const { t } = useI18n();

const formatAmount = formatMoney;

function openOrder(): void {
    void router.push(`/orders/${props.proformaInvoice.order.id}`);
}

function openProformaInvoice(): void {
    void router.push(`/proforma-invoices/${props.proformaInvoice.id}`);
}

function payProformaInvoice(): void {
    void router.push(`/proforma-invoices/${props.proformaInvoice.id}/pay`);
}

const isPayable = props.proformaInvoice.displayStatus !== 'cancelled';
</script>

<template>
    <article class="proforma-invoice-row">
        <div>
            <div class="proforma-invoice-row__name">
                {{ t('proformaInvoices.title', { number: proformaInvoice.number }) }}
                <ProformaInvoiceVersionBadge :version="proformaInvoice.version" />
            </div>
            <div v-if="proformaInvoice.supersededBy" class="proforma-invoice-row__meta">
                {{
                    t('proformaInvoices.newerVersion', {
                        version: proformaInvoice.supersededBy.version,
                        number: proformaInvoice.supersededBy.number,
                    })
                }}
            </div>
            <div class="proforma-invoice-row__meta">
                {{
                    t('proformaInvoices.issuedPayBy', {
                        issued: formatDate(proformaInvoice.issuedAt),
                        due: formatDate(proformaInvoice.dueDate),
                    })
                }}
            </div>
            <div class="proforma-invoice-row__meta">
                {{
                    t('proformaInvoices.order', {
                        number: formatDocumentNumber(proformaInvoice.order.code),
                    })
                }}
            </div>
        </div>

        <div>
            <div class="proforma-invoice-row__cell-title">{{ t('proformaInvoices.amount') }}</div>
            <div class="proforma-invoice-row__cell-value">
                {{ formatAmount(proformaInvoice.amount, proformaInvoice.currencyCode) }}
            </div>
        </div>

        <MvStatusBadge
            :variant="PROFORMA_INVOICE_STATUS_VARIANT[proformaInvoice.displayStatus] ?? 'neutral'"
        >
            {{ proformaInvoiceStatusLabel(proformaInvoice.displayStatus) }}
        </MvStatusBadge>

        <div class="proforma-invoice-row__actions">
            <MvButton variant="secondary" size="sm" @click="openOrder">{{
                t('proformaInvoices.actions.order')
            }}</MvButton>
            <MvButton variant="secondary" size="sm" @click="openProformaInvoice">{{
                t('proformaInvoices.actions.open')
            }}</MvButton>
            <MvButton v-if="isPayable" variant="primary" size="sm" @click="payProformaInvoice">{{
                t('proformaInvoices.actions.pay')
            }}</MvButton>
        </div>
    </article>
</template>

<style scoped>
.proforma-invoice-row {
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

.proforma-invoice-row__name {
    font-weight: 950;
    letter-spacing: -0.02em;
    margin-bottom: 5px;
    line-height: 1.28;
}

.proforma-invoice-row__meta {
    color: #66736e;
    font-size: 13px;
    line-height: 1.35;
}

.proforma-invoice-row__cell-title {
    color: #66736e;
    font-size: 12px;
    margin-bottom: 4px;
    font-weight: 850;
}

.proforma-invoice-row__cell-value {
    font-size: 14px;
    font-weight: 900;
    line-height: 1.3;
}

.proforma-invoice-row__actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
}

@media (max-width: 960px) {
    .proforma-invoice-row {
        grid-template-columns: minmax(0, 1fr) 120px;
    }
    .proforma-invoice-row__actions {
        grid-column: 1 / -1;
        justify-content: flex-start;
    }
}

@media (max-width: 640px) {
    .proforma-invoice-row {
        grid-template-columns: 1fr;
    }
    .proforma-invoice-row__actions {
        grid-column: auto;
    }
}
</style>
