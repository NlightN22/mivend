<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { MvStatusBadge } from '@mivend/ui-kit';
import MvButton from '@mivend/ui-kit/src/components/MvButton/MvButton.vue';
import AccountSidebar from '../account/AccountSidebar.vue';
import { useInvoiceDetail } from './useInvoiceDetail';
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_VARIANT } from './useInvoices';

const route = useRoute();
const { invoice, loading, load } = useInvoiceDetail();

onMounted(() => { void load(route.params.id as string); });

function formatAmount(cents: number, currency: string): string {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(cents / 100)
        + ' ' + (currency === 'RUB' ? '₽' : currency);
}
</script>

<template>
    <div class="id-layout">
        <AccountSidebar />

        <section class="id-content">
            <router-link to="/invoices" class="id-back">← My invoices</router-link>

            <div v-if="loading" class="id-state">Loading...</div>

            <div v-else-if="!invoice" class="id-state">Invoice not found.</div>

            <template v-else>
                <div class="id-head">
                    <div>
                        <h1 class="id-title">Invoice #{{ invoice.id }}</h1>
                        <div class="id-meta">Order {{ invoice.order.code }}</div>
                    </div>
                    <MvStatusBadge :variant="INVOICE_STATUS_VARIANT[invoice.status] ?? 'neutral'">
                        {{ INVOICE_STATUS_LABEL[invoice.status] ?? invoice.status }}
                    </MvStatusBadge>
                </div>

                <div class="id-summary">
                    <div class="id-summary-card">
                        <div class="id-summary-title">Invoice total</div>
                        <div class="id-summary-value">{{ formatAmount(invoice.amount, invoice.currencyCode) }}</div>
                    </div>
                </div>

                <div class="id-body">
                    <div class="id-lines">
                        <h2 class="id-section-title">Invoice items</h2>
                        <table class="id-table">
                            <thead>
                                <tr>
                                    <th>SKU</th>
                                    <th>Product</th>
                                    <th class="id-th-num">Qty</th>
                                    <th class="id-th-num">Price</th>
                                    <th class="id-th-num">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="(line, index) in invoice.lines" :key="index" class="id-row">
                                    <td class="id-sku">{{ line.productVariant.sku }}</td>
                                    <td>{{ line.productVariant.name }}</td>
                                    <td class="id-num">{{ line.quantity }}</td>
                                    <td class="id-num">{{ formatAmount(line.unitPriceWithTax, invoice.currencyCode) }}</td>
                                    <td class="id-num id-bold">{{ formatAmount(line.linePriceWithTax, invoice.currencyCode) }}</td>
                                </tr>
                            </tbody>
                        </table>

                        <div class="id-linked-order">
                            <div>
                                <div class="id-linked-order-title">Linked order</div>
                                <div class="id-linked-order-meta">{{ invoice.order.code }}</div>
                            </div>
                            <router-link :to="`/orders/${invoice.order.id}`">
                                <MvButton variant="secondary" size="sm">Open order</MvButton>
                            </router-link>
                        </div>
                    </div>

                    <aside class="id-aside">
                        <div class="id-pay-card">
                            <h2 class="id-section-title">Payment</h2>
                            <div class="id-pay-amount">{{ formatAmount(invoice.amount, invoice.currencyCode) }}</div>
                            <p v-if="invoice.status === 'paid'" class="id-pay-note">This invoice is fully paid.</p>
                            <p v-else-if="invoice.status === 'cancelled'" class="id-pay-note">This invoice is cancelled.</p>
                            <p v-else class="id-pay-note">Pay this invoice any time — independent of the order it came from.</p>
                            <MvButton
                                v-if="invoice.status === 'paid' || invoice.status === 'cancelled'"
                                variant="primary"
                                size="md"
                                disabled
                            >
                                Pay invoice
                            </MvButton>
                            <RouterLink v-else :to="`/invoices/${invoice.id}/pay`">
                                <MvButton variant="primary" size="md">Pay invoice</MvButton>
                            </RouterLink>
                        </div>

                        <div class="id-details-card">
                            <h2 class="id-section-title">Invoice details</h2>
                            <div class="id-detail-row">
                                <span>Organization</span>
                                <span class="id-detail-val">{{ invoice.organizationId }}</span>
                            </div>
                            <div class="id-detail-row">
                                <span>Currency</span>
                                <span class="id-detail-val">{{ invoice.currencyCode }}</span>
                            </div>
                        </div>
                    </aside>
                </div>
            </template>
        </section>
    </div>
</template>

<style scoped>
.id-layout {
    display: grid;
    grid-template-columns: 250px minmax(0, 1fr);
    gap: 24px;
    align-items: start;
    max-width: 1440px;
    margin: 0 auto;
    padding: 24px 28px 56px;
}

.id-content { min-width: 0; }

.id-back {
    display: inline-block;
    margin-bottom: 18px;
    color: #66736e;
    font-size: 14px;
    font-weight: 850;
    text-decoration: none;
}
.id-back:hover { color: #00a878; }

.id-state { color: #66736e; font-size: 14px; padding: 32px 0; text-align: center; }

.id-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
}

.id-title {
    margin: 0 0 4px;
    font-size: clamp(24px, 2.5vw, 36px);
    font-weight: 950;
    letter-spacing: -0.045em;
}

.id-meta { color: #66736e; font-size: 13px; }

.id-summary { margin-bottom: 22px; }

.id-summary-card {
    background: #fff;
    border: 1px solid #edf2ef;
    border-radius: 20px;
    padding: 18px 20px;
    display: inline-block;
}

.id-summary-title { color: #66736e; font-size: 13px; font-weight: 850; margin-bottom: 6px; }
.id-summary-value { font-size: 26px; font-weight: 950; letter-spacing: -0.03em; }

.id-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: 22px;
    align-items: start;
}

.id-section-title {
    margin: 0 0 14px;
    font-size: 16px;
    font-weight: 950;
    letter-spacing: -0.03em;
}

.id-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}

.id-table th {
    text-align: left;
    padding: 8px 10px;
    border-bottom: 2px solid #edf2ef;
    color: #66736e;
    font-weight: 850;
    font-size: 12px;
}

.id-th-num { text-align: right; }

.id-row td {
    padding: 10px 10px;
    border-bottom: 1px solid #f3f8f6;
    vertical-align: middle;
}

.id-sku { color: #66736e; font-size: 12px; font-weight: 850; white-space: nowrap; }
.id-num { text-align: right; white-space: nowrap; }
.id-bold { font-weight: 950; }

.id-linked-order {
    margin-top: 18px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    padding: 15px 16px;
    border: 1px solid #edf2ef;
    border-radius: 16px;
    background: #fbfcfd;
}

.id-linked-order-title { font-weight: 900; }
.id-linked-order-meta { margin-top: 4px; color: #66736e; font-size: 13px; }

.id-aside { display: grid; gap: 14px; }

.id-pay-card,
.id-details-card {
    background: #fff;
    border: 1px solid #edf2ef;
    border-radius: 20px;
    padding: 18px 20px;
}

.id-pay-amount { font-size: 28px; font-weight: 950; margin: 6px 0 4px; }
.id-pay-note { margin: 0 0 14px; color: #66736e; font-size: 13px; line-height: 1.45; }
.id-pay-card .mv-button { width: 100%; }

.id-detail-row {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    padding: 5px 0;
    color: #344640;
}
.id-detail-val { font-weight: 850; }

@media (max-width: 1100px) {
    .id-body { grid-template-columns: 1fr; }
}

@media (max-width: 960px) {
    .id-layout { grid-template-columns: 1fr; }
}

@media (max-width: 760px) {
    .id-layout { padding-left: 16px; padding-right: 16px; }
    .id-head { flex-direction: column; align-items: flex-start; }
}
</style>
