<script setup lang="ts">
import { formatDate, formatMoney } from '../../i18n/format';
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvButton, MvNotice, MvPanel, MvStatusBadge } from '@mivend/ui-kit';
import {
    PROFORMA_INVOICE_STATUS_BADGE_VARIANT,
    PROFORMA_INVOICE_STATUS_LABEL,
} from '../../api/proforma-invoices';
import { useOrderProformaInvoices } from '../../composables/useOrderProformaInvoices';

const { t } = useI18n();
const props = defineProps<{ orderId: string; cancelled: boolean }>();
const { proformaInvoices, allowed, requesting, error, load, request, withdraw } =
    useOrderProformaInvoices(() => props.orderId);

function date(iso: string): string {
    return formatDate(iso);
}

function money(cents: number, currency: string): string {
    return formatMoney(cents, currency);
}

onMounted(() => void load());
</script>

<template>
    <MvPanel :title="t('orderDetail.proformaPanel.title')">
        <p v-if="!proformaInvoices.length" class="pi-empty">
            {{ t('orderDetail.proformaPanel.empty') }}
        </p>
        <div v-for="proformaInvoice in proformaInvoices" :key="proformaInvoice.id" class="pi-row">
            <div class="pi-main">
                <RouterLink
                    :to="`/proforma-invoices/${proformaInvoice.id}`"
                    class="pi-link"
                    data-testid="proforma-card-link"
                >
                    <strong>№ {{ proformaInvoice.number }}</strong>
                </RouterLink>
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
                {{
                    t('orderDetail.proformaPanel.seller', {
                        name: proformaInvoice.seller?.legalName ?? proformaInvoice.organizationId,
                    })
                }}
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
                {{
                    t('orderDetail.proformaPanel.issued', {
                        issued: date(proformaInvoice.issuedAt),
                        due: date(proformaInvoice.dueDate),
                    })
                }}
                <template v-if="proformaInvoice.kind === 'by-shipment'">
                    · {{ t('orderDetail.proformaPanel.byShipment')
                    }}<template v-if="proformaInvoice.salesInvoiceNumber">
                        ({{
                            t('orderDetail.proformaPanel.realization', {
                                number: proformaInvoice.salesInvoiceNumber,
                            })
                        }})</template
                    ></template
                >
            </div>
            <div v-if="proformaInvoice.supersededBy" class="pi-meta">
                {{
                    t('orderDetail.proformaPanel.newer', {
                        version: proformaInvoice.supersededBy.version,
                        number: proformaInvoice.supersededBy.number,
                    })
                }}
            </div>
            <div v-else-if="proformaInvoice.supersedes" class="pi-meta">
                {{
                    t('orderDetail.proformaPanel.follows', {
                        version: proformaInvoice.version,
                        number: proformaInvoice.supersedes.number,
                    })
                }}
            </div>
            <MvButton
                v-if="allowed && proformaInvoice.displayStatus === 'current'"
                variant="secondary"
                size="sm"
                @click="withdraw(proformaInvoice.id)"
                >{{ t('orderDetail.proformaPanel.withdraw') }}</MvButton
            >
            <MvNotice v-if="proformaInvoice.orderChangedDifference != null" variant="warning">
                {{
                    t('orderDetail.proformaPanel.changed', {
                        amount: money(
                            proformaInvoice.orderChangedDifference,
                            proformaInvoice.currencyCode,
                        ),
                    })
                }}
            </MvNotice>
        </div>
        <MvButton
            v-if="allowed && !cancelled"
            variant="secondary"
            :loading="requesting"
            @click="request"
            >{{ t('orderDetail.proformaPanel.request') }}</MvButton
        >
        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>
    </MvPanel>
</template>

<style scoped>
.pi-row {
    display: grid;
    gap: 4px;
    padding: 8px 0;
    border-bottom: 1px solid var(--app-row-border);
}
.pi-main {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}
.pi-link {
    color: var(--el-color-primary-dark-2);
    text-decoration: none;
}
.pi-amount {
    margin-left: auto;
    font-weight: 700;
}
.pi-meta,
.pi-empty {
    color: var(--app-text-grey);
    font-size: 13px;
    margin: 0;
}
</style>
