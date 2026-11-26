<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import ProformaInvoiceCard from './ProformaInvoiceCard.vue';
import ProformaInvoiceSellerRows from './ProformaInvoiceSellerRows.vue';
import { formatDate } from './formatDate';
import type { ProformaInvoiceDetail } from './useProformaInvoiceDetail';

defineProps<{ proformaInvoice: ProformaInvoiceDetail }>();
const { t } = useI18n();
</script>

<template>
    <ProformaInvoiceCard :title="t('proformaInvoices.detail.sellerDetails')">
        <ProformaInvoiceSellerRows :seller="proformaInvoice.seller" />
        <div class="pir-row">
            <span>{{ t('proformaInvoices.detail.version') }}</span>
            <span class="pir-val">{{ proformaInvoice.version }}</span>
        </div>
        <div v-if="proformaInvoice.kind === 'by-shipment'" class="pir-row">
            <span>{{ t('proformaInvoices.detail.basis') }}</span>
            <span class="pir-val">{{
                proformaInvoice.salesInvoiceNumber
                    ? t('proformaInvoices.detail.byShipmentWithInvoice', {
                          number: proformaInvoice.salesInvoiceNumber,
                      })
                    : t('proformaInvoices.detail.byShipment')
            }}</span>
        </div>
        <div class="pir-row">
            <span>{{ t('proformaInvoices.detail.issued') }}</span>
            <span class="pir-val">{{ formatDate(proformaInvoice.issuedAt) }}</span>
        </div>
        <div class="pir-row">
            <span>{{ t('proformaInvoices.detail.payBy') }}</span>
            <span class="pir-val">{{ formatDate(proformaInvoice.dueDate) }}</span>
        </div>
        <div class="pir-row">
            <span>{{ t('proformaInvoices.detail.currency') }}</span>
            <span class="pir-val">{{ proformaInvoice.currencyCode }}</span>
        </div>
    </ProformaInvoiceCard>
</template>

<style scoped>
.pir-row {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    padding: 3px 0;
    color: var(--app-nav-label);
}
.pir-val {
    font-weight: 850;
    color: var(--app-text-body2);
}
</style>
