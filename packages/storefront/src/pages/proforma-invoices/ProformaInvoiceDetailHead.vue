<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvCopyButton, MvStatusBadge } from '@mivend/ui-kit';
import ProformaInvoiceVersionBadge from './ProformaInvoiceVersionBadge.vue';
import ProformaInvoiceKindBadge from './ProformaInvoiceKindBadge.vue';
import { formatDate } from './formatDate';
import { proformaInvoiceStatusLabel, PROFORMA_INVOICE_STATUS_VARIANT } from './useProformaInvoices';

defineProps<{
    number: string;
    version: number;
    kind: string;
    issuedAt: string;
    displayStatus: string;
}>();
const { t } = useI18n();
const pageUrl = (): string => window.location.href;
</script>

<template>
    <div class="pih">
        <div>
            <h1 class="pih-title">
                {{ t('proformaInvoices.title', { number }) }}
                <ProformaInvoiceVersionBadge :version="version" />
                <ProformaInvoiceKindBadge :kind="kind" />
            </h1>
            <div class="pih-meta-row">
                <span class="pih-meta">{{ formatDate(issuedAt) }}</span>
                <MvCopyButton :value="number" :label="t('proformaInvoices.detail.copyNumber')" />
                <MvCopyButton
                    :value="pageUrl"
                    icon="share"
                    :label="t('proformaInvoices.detail.copyLink')"
                />
            </div>
        </div>
        <MvStatusBadge :variant="PROFORMA_INVOICE_STATUS_VARIANT[displayStatus] ?? 'neutral'">
            {{ proformaInvoiceStatusLabel(displayStatus) }}
        </MvStatusBadge>
    </div>
</template>

<style scoped>
.pih {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 24px;
}
.pih-title {
    margin: 0 0 4px;
    font-size: clamp(24px, 2.5vw, 36px);
    font-weight: 950;
    letter-spacing: -0.045em;
}
.pih-meta-row {
    display: flex;
    align-items: center;
    gap: 8px;
}
.pih-meta {
    color: var(--app-nav-label);
    font-size: 13px;
}
@media (max-width: 760px) {
    .pih {
        flex-direction: column;
        align-items: flex-start;
    }
}
</style>
