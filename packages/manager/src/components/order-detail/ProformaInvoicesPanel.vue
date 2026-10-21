<script setup lang="ts">
import { onMounted } from 'vue';
import { MvButton, MvNotice, MvPanel, MvStatusBadge } from '@mivend/ui-kit';
import {
    PROFORMA_INVOICE_STATUS_BADGE_VARIANT,
    PROFORMA_INVOICE_STATUS_LABEL,
} from '../../api/proforma-invoices';
import { useOrderProformaInvoices } from '../../composables/useOrderProformaInvoices';

const props = defineProps<{ orderId: string; cancelled: boolean }>();
const { proformaInvoices, allowed, requesting, error, load, request, withdraw } =
    useOrderProformaInvoices(() => props.orderId);

function date(iso: string): string {
    return new Date(iso).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}

function money(cents: number, currency: string): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

onMounted(() => void load());
</script>

<template>
    <MvPanel title="Proforma invoices">
        <p v-if="!proformaInvoices.length" class="pi-empty">No proforma invoices issued yet.</p>
        <div v-for="proformaInvoice in proformaInvoices" :key="proformaInvoice.id" class="pi-row">
            <div class="pi-main">
                <strong>№ {{ proformaInvoice.number }}</strong>
                <MvStatusBadge variant="info">v{{ proformaInvoice.version }}</MvStatusBadge>
                <MvStatusBadge
                    :variant="
                        PROFORMA_INVOICE_STATUS_BADGE_VARIANT[proformaInvoice.displayStatus] ??
                        'neutral'
                    "
                    >{{
                        PROFORMA_INVOICE_STATUS_LABEL[proformaInvoice.displayStatus] ??
                        proformaInvoice.displayStatus
                    }}</MvStatusBadge
                >
                <span class="pi-amount">{{
                    money(proformaInvoice.amount, proformaInvoice.currencyCode)
                }}</span>
            </div>
            <div class="pi-meta">
                Seller: {{ proformaInvoice.seller?.legalName ?? proformaInvoice.organizationId }}
                <a
                    v-if="
                        proformaInvoice.document?.status === 'ready' &&
                        proformaInvoice.document.pdfUrl
                    "
                    :href="proformaInvoice.document.pdfUrl"
                    target="_blank"
                    rel="noopener"
                    >PDF</a
                >
            </div>
            <div class="pi-meta">
                Issued {{ date(proformaInvoice.issuedAt) }}, pay by
                {{ date(proformaInvoice.dueDate) }}
                <template v-if="proformaInvoice.kind === 'by-shipment'">
                    · by shipment<template v-if="proformaInvoice.salesInvoiceNumber">
                        (realization № {{ proformaInvoice.salesInvoiceNumber }})</template
                    ></template
                >
            </div>
            <div v-if="proformaInvoice.supersededBy" class="pi-meta">
                There is a newer version v{{ proformaInvoice.supersededBy.version }} (№
                {{ proformaInvoice.supersededBy.number }})
            </div>
            <div v-else-if="proformaInvoice.supersedes" class="pi-meta">
                Version {{ proformaInvoice.version }}, follows №
                {{ proformaInvoice.supersedes.number }}
            </div>
            <MvButton
                v-if="allowed && proformaInvoice.displayStatus === 'current'"
                variant="secondary"
                size="sm"
                @click="withdraw(proformaInvoice.id)"
                >Withdraw</MvButton
            >
            <MvNotice v-if="proformaInvoice.orderChangedDifference != null" variant="warning">
                Order changed after payment, difference
                {{ money(proformaInvoice.orderChangedDifference, proformaInvoice.currencyCode) }}.
                Settled through the ERP.
            </MvNotice>
        </div>
        <MvButton
            v-if="allowed && !cancelled"
            variant="secondary"
            :loading="requesting"
            @click="request"
            >Request proforma invoices</MvButton
        >
        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>
    </MvPanel>
</template>

<style scoped>
.pi-row {
    display: grid;
    gap: 4px;
    padding: 8px 0;
    border-bottom: 1px solid #edf2ef;
}
.pi-main {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}
.pi-amount {
    margin-left: auto;
    font-weight: 700;
}
.pi-meta,
.pi-empty {
    color: #66736e;
    font-size: 13px;
    margin: 0;
}
</style>
