<script setup lang="ts">
import { computed, nextTick, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { MvStatusBadge, formatDocumentNumber } from '@mivend/ui-kit';
import MvButton from '@mivend/ui-kit/src/components/MvButton/MvButton.vue';
import AccountSidebar from '../account/AccountSidebar.vue';
import ProformaInvoiceSellerRows from './ProformaInvoiceSellerRows.vue';
import ProformaInvoiceVersionBadge from './ProformaInvoiceVersionBadge.vue';
import ProformaInvoiceKindBadge from './ProformaInvoiceKindBadge.vue';
import { isContractKind } from './proformaKind';
import ProformaInvoiceVersionNotice from './ProformaInvoiceVersionNotice.vue';
import { formatMoney } from './formatMoney';
import { formatDate } from './formatDate';
import { useProformaInvoiceDetail } from './useProformaInvoiceDetail';
import { proformaInvoiceStatusLabel, PROFORMA_INVOICE_STATUS_VARIANT } from './useProformaInvoices';

const { t } = useI18n();
const route = useRoute();
const { proformaInvoice, loading, load } = useProformaInvoiceDetail();
const pdfUrl = computed(() => {
    const document = proformaInvoice.value?.document;
    return document?.status === 'ready' ? (document.pdfUrl ?? null) : null;
});

// `?print=1` (opened in a new tab after checkout) shows the browser print dialog once loaded.
onMounted(async () => {
    await load(route.params.id as string);
    if (route.query.print === '1' && proformaInvoice.value) {
        await nextTick();
        window.print();
    }
});

const formatAmount = formatMoney;
function openPdf(url: string): void {
    window.open(url, '_blank', 'noopener');
}
const contractKind = computed(() => isContractKind(proformaInvoice.value?.kind));
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

            <template v-else>
                <div class="id-head">
                    <div>
                        <h1 class="id-title">
                            {{ t('proformaInvoices.title', { number: proformaInvoice.number }) }}
                            <ProformaInvoiceVersionBadge :version="proformaInvoice.version" />
                            <ProformaInvoiceKindBadge :kind="proformaInvoice.kind" />
                        </h1>
                        <div v-if="proformaInvoice.order" class="id-meta">
                            {{
                                t('proformaInvoices.order', {
                                    number: formatDocumentNumber(proformaInvoice.order.code),
                                })
                            }}
                        </div>
                        <div v-else-if="proformaInvoice.contractName" class="id-meta">
                            {{
                                t('proformaInvoices.contract', {
                                    name: proformaInvoice.contractName,
                                })
                            }}
                        </div>
                    </div>
                    <MvStatusBadge
                        :variant="
                            PROFORMA_INVOICE_STATUS_VARIANT[proformaInvoice.displayStatus] ??
                            'neutral'
                        "
                    >
                        {{ proformaInvoiceStatusLabel(proformaInvoice.displayStatus) }}
                    </MvStatusBadge>
                </div>

                <ProformaInvoiceVersionNotice
                    :version="proformaInvoice.version"
                    :currency-code="proformaInvoice.currencyCode"
                    :supersedes="proformaInvoice.supersedes"
                    :superseded-by="proformaInvoice.supersededBy"
                    :order-changed-difference="proformaInvoice.orderChangedDifference"
                />

                <div class="id-summary">
                    <div class="id-summary-card">
                        <div class="id-summary-title">
                            {{ t('proformaInvoices.detail.total') }}
                        </div>
                        <div class="id-summary-value">
                            {{ formatAmount(proformaInvoice.amount, proformaInvoice.currencyCode) }}
                        </div>
                    </div>
                </div>

                <div class="id-body">
                    <div class="id-lines">
                        <h2 class="id-section-title">
                            {{ t('proformaInvoices.detail.items') }}
                        </h2>
                        <table class="id-table">
                            <thead>
                                <tr>
                                    <th>{{ t('proformaInvoices.detail.sku') }}</th>
                                    <th>{{ t('proformaInvoices.detail.product') }}</th>
                                    <th class="id-th-num">
                                        {{ t('proformaInvoices.detail.qty') }}
                                    </th>
                                    <th class="id-th-num">
                                        {{ t('proformaInvoices.detail.price') }}
                                    </th>
                                    <th class="id-th-num">
                                        {{ t('proformaInvoices.detail.lineTotal') }}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr
                                    v-for="(line, index) in proformaInvoice.lines"
                                    :key="index"
                                    class="id-row"
                                >
                                    <td class="id-sku">{{ line.productVariant.sku }}</td>
                                    <td>{{ line.productVariant.name }}</td>
                                    <td class="id-num">{{ line.quantity }}</td>
                                    <td class="id-num">
                                        {{
                                            formatAmount(
                                                line.unitPriceWithTax,
                                                proformaInvoice.currencyCode,
                                            )
                                        }}
                                    </td>
                                    <td class="id-num id-bold">
                                        {{
                                            formatAmount(
                                                line.linePriceWithTax,
                                                proformaInvoice.currencyCode,
                                            )
                                        }}
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        <div v-if="proformaInvoice.order" class="id-linked-order">
                            <div>
                                <div class="id-linked-order-title">
                                    {{ t('proformaInvoices.detail.linkedOrder') }}
                                </div>
                                <div class="id-linked-order-meta">
                                    {{ formatDocumentNumber(proformaInvoice.order.code) }}
                                </div>
                            </div>
                            <router-link :to="`/orders/${proformaInvoice.order.id}`">
                                <MvButton variant="secondary" size="sm">{{
                                    t('proformaInvoices.detail.openOrder')
                                }}</MvButton>
                            </router-link>
                        </div>
                    </div>

                    <aside class="id-aside">
                        <div class="id-pay-card">
                            <h2 class="id-section-title">
                                {{ t('proformaInvoices.detail.payment') }}
                            </h2>
                            <div class="id-pay-amount">
                                {{
                                    formatAmount(
                                        proformaInvoice.amount,
                                        proformaInvoice.currencyCode,
                                    )
                                }}
                            </div>
                            <p class="id-pay-note">
                                {{
                                    t('proformaInvoices.detail.payByNote', {
                                        date: formatDate(proformaInvoice.dueDate),
                                    })
                                }}
                            </p>
                            <p
                                v-if="proformaInvoice.displayStatus === 'cancelled'"
                                class="id-pay-note"
                            >
                                {{ t('proformaInvoices.detail.cancelled') }}
                            </p>
                            <MvButton
                                v-if="contractKind"
                                variant="primary"
                                size="md"
                                :disabled="!pdfUrl"
                                @click="pdfUrl && openPdf(pdfUrl)"
                            >
                                {{ t('proformaInvoices.detail.downloadPdf') }}
                            </MvButton>
                            <MvButton
                                v-else-if="proformaInvoice.displayStatus === 'cancelled'"
                                variant="primary"
                                size="md"
                                disabled
                            >
                                {{ t('proformaInvoices.detail.pay') }}
                            </MvButton>
                            <RouterLink v-else :to="`/proforma-invoices/${proformaInvoice.id}/pay`">
                                <MvButton variant="primary" size="md">{{
                                    t('proformaInvoices.detail.pay')
                                }}</MvButton>
                            </RouterLink>
                        </div>

                        <div class="id-details-card">
                            <h2 class="id-section-title">
                                {{ t('proformaInvoices.detail.details') }}
                            </h2>
                            <ProformaInvoiceSellerRows :seller="proformaInvoice.seller" />
                            <div class="id-detail-row">
                                <span>{{ t('proformaInvoices.detail.version') }}</span>
                                <span class="id-detail-val">{{ proformaInvoice.version }}</span>
                            </div>
                            <div
                                v-if="proformaInvoice.kind === 'by-shipment'"
                                class="id-detail-row"
                            >
                                <span>{{ t('proformaInvoices.detail.basis') }}</span>
                                <span class="id-detail-val">{{
                                    proformaInvoice.salesInvoiceNumber
                                        ? t('proformaInvoices.detail.byShipmentWithInvoice', {
                                              number: proformaInvoice.salesInvoiceNumber,
                                          })
                                        : t('proformaInvoices.detail.byShipment')
                                }}</span>
                            </div>
                            <div class="id-detail-row">
                                <span>{{ t('proformaInvoices.detail.issued') }}</span>
                                <span class="id-detail-val">{{
                                    formatDate(proformaInvoice.issuedAt)
                                }}</span>
                            </div>
                            <div class="id-detail-row">
                                <span>{{ t('proformaInvoices.detail.payBy') }}</span>
                                <span class="id-detail-val">{{
                                    formatDate(proformaInvoice.dueDate)
                                }}</span>
                            </div>
                            <div v-if="pdfUrl" class="id-detail-row">
                                <span>{{ t('proformaInvoices.detail.document') }}</span>
                                <a :href="pdfUrl" target="_blank" rel="noopener">{{
                                    t('proformaInvoices.detail.downloadPdf')
                                }}</a>
                            </div>
                            <div class="id-detail-row">
                                <span>{{ t('proformaInvoices.detail.currency') }}</span>
                                <span class="id-detail-val">{{
                                    proformaInvoice.currencyCode
                                }}</span>
                            </div>
                        </div>
                    </aside>
                </div>
            </template>
        </section>
    </div>
</template>

<style scoped src="./ProformaInvoiceDetailPage.css"></style>
