<script setup lang="ts">
import { computed, nextTick, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import AccountSidebar from '../account/AccountSidebar.vue';
import ProformaInvoiceActionsCard from './ProformaInvoiceActionsCard.vue';
import ProformaInvoiceDetailHead from './ProformaInvoiceDetailHead.vue';
import ProformaInvoiceLinesCard from './ProformaInvoiceLinesCard.vue';
import ProformaInvoiceLinkedOrderCard from './ProformaInvoiceLinkedOrderCard.vue';
import ProformaInvoiceRequisitesCard from './ProformaInvoiceRequisitesCard.vue';
import ProformaInvoiceSummaryStrip from './ProformaInvoiceSummaryStrip.vue';
import ProformaInvoiceTotalsCard from './ProformaInvoiceTotalsCard.vue';
import ProformaInvoiceVersionNotice from './ProformaInvoiceVersionNotice.vue';
import { isContractKind } from './proformaKind';
import { formatMoney } from './formatMoney';
import { formatDate } from './formatDate';
import { proformaPdfUrl, openPdf } from './proformaPdfUrl';
import { usePaymentStubAvailable } from './usePaymentStubAvailable';
import { useProformaInvoiceDetail } from './useProformaInvoiceDetail';

const { t } = useI18n();
const route = useRoute();
const { proformaInvoice, loading, load } = useProformaInvoiceDetail();
const pdfUrl = computed(() => proformaPdfUrl(proformaInvoice.value?.document));
const { available: stubAvailable } = usePaymentStubAvailable();
const contractKind = computed(() => isContractKind(proformaInvoice.value?.kind));
const cancelled = computed(() => proformaInvoice.value?.displayStatus === 'cancelled');
const payTo = computed(() =>
    proformaInvoice.value && !contractKind.value && stubAvailable.value
        ? `/proforma-invoices/${proformaInvoice.value.id}/pay`
        : null,
);

// `?print=1` (opened in a new tab after checkout) shows the browser print dialog once loaded.
onMounted(async () => {
    await load(route.params.id as string);
    if (route.query.print === '1' && proformaInvoice.value) {
        await nextTick();
        window.print();
    }
});
</script>

<template>
    <div class="id-layout">
        <AccountSidebar class="id-sidebar" />

        <section class="id-content">
            <router-link to="/proforma-invoices" class="id-back id-no-print"
                >← {{ t('proformaInvoices.detail.back') }}</router-link
            >

            <div v-if="loading" class="id-state">{{ t('common.loading') }}</div>

            <div v-else-if="!proformaInvoice" class="id-state">
                {{ t('proformaInvoices.detail.notFound') }}
            </div>

            <div v-else class="id-body">
                <div class="id-main">
                    <ProformaInvoiceDetailHead
                        :number="proformaInvoice.number"
                        :version="proformaInvoice.version"
                        :kind="proformaInvoice.kind"
                        :issued-at="proformaInvoice.issuedAt"
                        :display-status="proformaInvoice.displayStatus"
                    />

                    <ProformaInvoiceVersionNotice
                        :version="proformaInvoice.version"
                        :currency-code="proformaInvoice.currencyCode"
                        :supersedes="proformaInvoice.supersedes"
                        :superseded-by="proformaInvoice.supersededBy"
                        :order-changed-difference="proformaInvoice.orderChangedDifference"
                    />

                    <ProformaInvoiceSummaryStrip
                        :count="proformaInvoice.lines.length"
                        :total="formatMoney(proformaInvoice.amount, proformaInvoice.currencyCode)"
                        :due-date="formatDate(proformaInvoice.dueDate)"
                    />

                    <ProformaInvoiceLinesCard :proforma-invoice="proformaInvoice" />
                </div>

                <aside class="id-aside">
                    <ProformaInvoiceActionsCard
                        :pay-to="payTo"
                        :pay-disabled="cancelled && !contractKind"
                        :pdf-ready="!!pdfUrl"
                        :order-id="proformaInvoice.order?.id ?? null"
                        :cancelled="cancelled"
                        @download-pdf="pdfUrl && openPdf(pdfUrl)"
                    />
                    <ProformaInvoiceTotalsCard
                        :count="proformaInvoice.lines.length"
                        :total="formatMoney(proformaInvoice.amount, proformaInvoice.currencyCode)"
                    />
                    <ProformaInvoiceLinkedOrderCard
                        v-if="proformaInvoice.order"
                        :order="proformaInvoice.order"
                    />
                    <ProformaInvoiceRequisitesCard :proforma-invoice="proformaInvoice" />
                </aside>
            </div>
        </section>
    </div>
</template>

<style scoped src="./ProformaInvoiceDetailPage.css"></style>
