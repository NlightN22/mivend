<script setup lang="ts">
import { onMounted } from 'vue';
import { MvButton, MvNotice, MvPanel, MvStatusBadge } from '@mivend/ui-kit';
import { PROFORMA_INVOICE_STATUS_BADGE_VARIANT } from '../../api/proforma-invoices';
import { useOrderProformaInvoices } from '../../composables/useOrderProformaInvoices';

const props = defineProps<{ orderId: string; cancelled: boolean }>();
const { invoices, allowed, requesting, error, load, request } = useOrderProformaInvoices(
    () => props.orderId,
);

function money(cents: number, currency: string): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

onMounted(() => void load());
</script>

<template>
    <MvPanel title="Proforma invoices">
        <p v-if="!invoices.length" class="pi-empty">No proforma invoices issued yet.</p>
        <div v-for="invoice in invoices" :key="invoice.id" class="pi-row">
            <div class="pi-main">
                <strong>№ {{ invoice.number }}</strong>
                <MvStatusBadge variant="info">v{{ invoice.version }}</MvStatusBadge>
                <MvStatusBadge
                    :variant="PROFORMA_INVOICE_STATUS_BADGE_VARIANT[invoice.status] ?? 'neutral'"
                    >{{ invoice.status }}</MvStatusBadge
                >
                <span class="pi-amount">{{ money(invoice.amount, invoice.currencyCode) }}</span>
            </div>
            <div class="pi-meta">
                Seller: {{ invoice.seller?.legalName ?? invoice.organizationId }}
                <a
                    v-if="invoice.document?.status === 'ready' && invoice.document.asset"
                    :href="invoice.document.asset.source"
                    target="_blank"
                    rel="noopener"
                    >PDF</a
                >
            </div>
            <div v-if="invoice.supersededBy" class="pi-meta">
                Replaced by version v{{ invoice.supersededBy.version }} (№
                {{ invoice.supersededBy.number }})
            </div>
            <div v-else-if="invoice.supersedes" class="pi-meta">
                Version {{ invoice.version }}, replaces № {{ invoice.supersedes.number }}
            </div>
            <MvNotice v-if="invoice.orderChangedDifference != null" variant="warning">
                Order changed after payment, difference
                {{ money(invoice.orderChangedDifference, invoice.currencyCode) }}. Settled through
                the ERP.
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
