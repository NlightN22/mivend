<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { MvStatusBadge } from '@mivend/ui-kit';
import MvButton from '@mivend/ui-kit/src/components/MvButton/MvButton.vue';
import AccountSidebar from '../account/AccountSidebar.vue';
import { usePaymentDetail } from './usePaymentDetail';
import { PAYMENT_STATUS_LABEL, PAYMENT_STATUS_VARIANT, PAYMENT_CHANNEL_LABEL } from './usePayments';

const route = useRoute();
const { payment, loading, load } = usePaymentDetail();

onMounted(() => { void load(route.params.id as string); });

function formatAmount(cents: number, currency: string): string {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(cents / 100)
        + ' ' + (currency === 'RUB' ? '₽' : currency);
}

function formatDateTime(iso: string): string {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        + ', ' + new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

const invoiceAllocations = computed(() => payment.value?.allocations.filter(a => !a.isAdvance) ?? []);
const advanceAllocation = computed(() => payment.value?.allocations.find(a => a.isAdvance));

const appliedTotal = computed(() =>
    invoiceAllocations.value.reduce((sum, a) => sum + a.amount, 0),
);

const refundedTotal = computed(() =>
    (payment.value?.refunds ?? [])
        .filter(r => r.status === 'succeeded')
        .reduce((sum, r) => sum + r.amount, 0),
);
</script>

<template>
    <div class="pd-layout">
        <AccountSidebar />

        <section class="pd-content">
            <router-link to="/payments" class="pd-back">← My payments</router-link>

            <div v-if="loading" class="pd-state">Loading...</div>
            <div v-else-if="!payment" class="pd-state">Payment not found.</div>

            <template v-else>
                <div class="pd-head">
                    <div>
                        <div class="pd-payment-id">PAY-{{ payment.id }}</div>
                        <h1 class="pd-title">{{ formatAmount(payment.amount, payment.currencyCode) }}</h1>
                        <MvStatusBadge :variant="PAYMENT_STATUS_VARIANT[payment.status] ?? 'neutral'">
                            {{ PAYMENT_STATUS_LABEL[payment.status] ?? payment.status }}
                        </MvStatusBadge>
                    </div>
                    <div class="pd-source-pill">
                        <span class="pd-dot" :class="`pd-dot--${payment.channel}`"></span>
                        {{ PAYMENT_CHANNEL_LABEL[payment.channel] ?? payment.channel }}
                    </div>
                </div>

                <div class="pd-meta">
                    <div class="pd-meta-item"><label>Created</label><strong>{{ formatDateTime(payment.createdAt) }}</strong></div>
                    <div class="pd-meta-item" v-if="payment.order">
                        <label>Order</label>
                        <router-link class="pd-link" :to="`/orders/${payment.order.id}`">{{ payment.order.code }}</router-link>
                    </div>
                    <div class="pd-meta-item" v-if="payment.invoice">
                        <label>Target invoice</label>
                        <router-link class="pd-link" :to="`/invoices/${payment.invoice.id}`">Invoice #{{ payment.invoice.id }}</router-link>
                    </div>
                </div>

                <div class="pd-summary">
                    <div class="pd-summary-row"><span>Payment amount</span><strong>{{ formatAmount(payment.amount, payment.currencyCode) }}</strong></div>
                    <div class="pd-summary-row"><span>Applied to invoices</span><strong>{{ formatAmount(appliedTotal, payment.currencyCode) }}</strong></div>
                    <div class="pd-summary-row"><span>Refunded</span><strong>{{ formatAmount(refundedTotal, payment.currencyCode) }}</strong></div>
                    <div class="pd-summary-row pd-summary-row--total"><span>Unallocated (advance)</span><strong>{{ formatAmount(advanceAllocation?.amount ?? 0, payment.currencyCode) }}</strong></div>
                </div>

                <div class="pd-body">
                    <div class="pd-main">
                        <section class="pd-card">
                            <h2 class="pd-card-title">Invoice allocation</h2>
                            <p class="pd-card-sub">Shows which invoices were covered by this payment and how much was applied.</p>
                            <table v-if="invoiceAllocations.length" class="pd-table">
                                <thead>
                                    <tr><th>Invoice</th><th class="pd-th-num">Invoice total</th><th class="pd-th-num">Applied</th><th>Status</th></tr>
                                </thead>
                                <tbody>
                                    <tr v-for="(a, i) in invoiceAllocations" :key="i">
                                        <td>
                                            <router-link class="pd-link" :to="`/invoices/${a.invoice?.id}`">Invoice #{{ a.invoice?.id }}</router-link>
                                            <div class="pd-row-meta" v-if="a.invoice?.order">Order {{ a.invoice.order.code }}</div>
                                        </td>
                                        <td class="pd-num">{{ a.invoice ? formatAmount(a.invoice.amount, a.invoice.currencyCode) : '—' }}</td>
                                        <td class="pd-num pd-bold">{{ formatAmount(a.amount, payment.currencyCode) }}</td>
                                        <td><MvStatusBadge :variant="a.invoice?.status === 'paid' ? 'success' : 'warning'">{{ a.invoice?.status }}</MvStatusBadge></td>
                                    </tr>
                                </tbody>
                            </table>
                            <p v-else class="pd-empty">This payment was not applied to any invoice — it is held entirely as an advance.</p>
                        </section>

                        <section class="pd-card">
                            <h2 class="pd-card-title">Processing history <span class="pd-mock-tag">partly mock</span></h2>
                            <p class="pd-card-sub">Only the creation event is tracked today — a full step-by-step lifecycle log (authorized → settled) is not implemented yet.</p>
                            <div class="pd-timeline">
                                <div class="pd-event">
                                    <div class="pd-event-title">Payment attempt created ({{ PAYMENT_STATUS_LABEL[payment.status] ?? payment.status }})</div>
                                    <time class="pd-event-time">{{ formatDateTime(payment.createdAt) }}</time>
                                </div>
                            </div>
                        </section>

                        <section class="pd-card" v-if="payment.refunds.length || payment.disputes.length">
                            <h2 class="pd-card-title">Refunds and disputes</h2>
                            <table v-if="payment.refunds.length" class="pd-table">
                                <thead><tr><th>Refund</th><th class="pd-th-num">Amount</th><th>Status</th><th>Reason</th></tr></thead>
                                <tbody>
                                    <tr v-for="r in payment.refunds" :key="r.id">
                                        <td>{{ r.providerRefundId ?? `#${r.id}` }}</td>
                                        <td class="pd-num">{{ formatAmount(r.amount, payment.currencyCode) }}</td>
                                        <td><MvStatusBadge :variant="r.status === 'succeeded' ? 'success' : r.status === 'failed' ? 'danger' : 'warning'">{{ r.status }}</MvStatusBadge></td>
                                        <td>{{ r.reason }}</td>
                                    </tr>
                                </tbody>
                            </table>
                            <table v-if="payment.disputes.length" class="pd-table">
                                <thead><tr><th>Dispute</th><th class="pd-th-num">Amount</th><th>Status</th><th>Opened</th></tr></thead>
                                <tbody>
                                    <tr v-for="d in payment.disputes" :key="d.id">
                                        <td>{{ d.type }}</td>
                                        <td class="pd-num">{{ formatAmount(d.amount, payment.currencyCode) }}</td>
                                        <td><MvStatusBadge :variant="d.status === 'won' ? 'success' : d.status === 'lost' ? 'danger' : 'warning'">{{ d.status }}</MvStatusBadge></td>
                                        <td>{{ formatDateTime(d.openedAt) }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </section>
                        <section class="pd-card" v-else>
                            <h2 class="pd-card-title">Refunds and disputes</h2>
                            <div class="pd-notice">
                                No refunds, chargebacks or disputes have been registered for this payment.
                                <template v-if="payment.channel === 'bank-transfer-erp'">A bank transfer has no automated refund path — a reversal is reported as a new, independent outgoing transfer, not a refund of this payment.</template>
                            </div>
                        </section>
                    </div>

                    <aside class="pd-aside">
                        <section class="pd-card">
                            <h2 class="pd-card-title">Payment information</h2>
                            <div class="pd-detail-row"><span>Payment ID</span><strong>PAY-{{ payment.id }}</strong></div>
                            <div class="pd-detail-row"><span>Source channel</span><strong>{{ payment.channel }}</strong></div>
                            <div class="pd-detail-row"><span>Currency</span><strong>{{ payment.currencyCode }}</strong></div>
                            <div class="pd-detail-row pd-detail-row--mock"><span>Payment method <span class="pd-mock-tag">mock</span></span><strong>— (no real acquirer integrated)</strong></div>
                            <div class="pd-detail-row"><span>External reference</span><strong>{{ payment.externalReference ?? '—' }}</strong></div>
                        </section>

                        <section class="pd-card">
                            <h2 class="pd-card-title">Related records</h2>
                            <div class="pd-detail-row" v-if="payment.invoice">
                                <span>Invoice</span>
                                <router-link class="pd-link" :to="`/invoices/${payment.invoice.id}`">Invoice #{{ payment.invoice.id }}</router-link>
                            </div>
                            <div class="pd-detail-row" v-if="payment.order">
                                <span>Order</span>
                                <router-link class="pd-link" :to="`/orders/${payment.order.id}`">{{ payment.order.code }}</router-link>
                            </div>
                            <div class="pd-detail-row pd-detail-row--mock">
                                <span>Receipt <span class="pd-mock-tag">mock</span></span>
                                <MvButton variant="secondary" size="sm" disabled>Download</MvButton>
                            </div>
                        </section>
                    </aside>
                </div>
            </template>
        </section>
    </div>
</template>

<style scoped>
.pd-layout {
    display: grid;
    grid-template-columns: 250px minmax(0, 1fr);
    gap: 24px;
    align-items: start;
    max-width: 1440px;
    margin: 0 auto;
    padding: 24px 28px 56px;
}

.pd-content { min-width: 0; }

.pd-back {
    display: inline-block;
    margin-bottom: 18px;
    color: #66736e;
    font-size: 14px;
    font-weight: 850;
    text-decoration: none;
}
.pd-back:hover { color: #00a878; }

.pd-state { color: #66736e; font-size: 14px; padding: 32px 0; text-align: center; }

.pd-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
}

.pd-payment-id { color: #66736e; font-size: 13px; font-weight: 850; margin-bottom: 4px; }
.pd-title { margin: 0 0 8px; font-size: clamp(28px, 3vw, 40px); font-weight: 950; letter-spacing: -0.045em; }

.pd-source-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 1px solid #edf2ef;
    border-radius: 999px;
    padding: 8px 12px;
    font-size: 13px;
    font-weight: 850;
    background: #fff;
    white-space: nowrap;
}

.pd-dot { width: 9px; height: 9px; border-radius: 50%; }
.pd-dot--online-acquiring { background: #08ad7b; }
.pd-dot--branch-kassa { background: #ff8900; }
.pd-dot--bank-transfer-erp { background: #2474d8; }

.pd-meta {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
    margin-bottom: 18px;
}
.pd-meta-item { background: #f7faf9; border-radius: 14px; padding: 12px 14px; }
.pd-meta-item label { display: block; color: #6c7a82; font-size: 11px; font-weight: 800; margin-bottom: 5px; }
.pd-meta-item strong { font-size: 14px; }

.pd-link { color: #087d60; font-weight: 950; text-decoration: none; }
.pd-link:hover { text-decoration: underline; }

.pd-summary {
    background: #fff;
    border: 1px solid #edf2ef;
    border-radius: 20px;
    padding: 18px 20px;
    margin-bottom: 22px;
    max-width: 460px;
}

.pd-summary-row { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid #edf2ef; font-size: 14px; color: #67767e; }
.pd-summary-row:last-child { border-bottom: 0; }
.pd-summary-row strong { color: #17231f; font-size: 15px; }
.pd-summary-row--total strong { font-size: 18px; }
.pd-summary-row--mock { color: #a3aca6; }

.pd-mock-tag {
    background: #eef1ef;
    color: #7a877f;
    border-radius: 999px;
    padding: 2px 7px;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
    margin-left: 6px;
}

.pd-body { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 22px; align-items: start; }
.pd-main, .pd-aside { display: grid; gap: 16px; }

.pd-card { background: #fff; border: 1px solid #edf2ef; border-radius: 20px; padding: 20px; }
.pd-card-title { margin: 0 0 6px; font-size: 17px; font-weight: 950; letter-spacing: -0.02em; display: flex; align-items: center; }
.pd-card-sub { margin: 0 0 14px; color: #66736e; font-size: 13px; line-height: 1.45; }

.pd-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.pd-table th { text-align: left; padding: 8px 10px; border-bottom: 2px solid #edf2ef; color: #66736e; font-weight: 850; font-size: 12px; }
.pd-th-num { text-align: right; }
.pd-table td { padding: 12px 10px; border-bottom: 1px solid #f3f8f6; vertical-align: middle; }
.pd-num { text-align: right; white-space: nowrap; }
.pd-bold { font-weight: 950; }
.pd-row-meta { color: #66736e; font-size: 12px; margin-top: 2px; }
.pd-empty { color: #66736e; font-size: 13px; }

.pd-timeline { display: grid; gap: 4px; }
.pd-event-title { font-weight: 900; font-size: 14px; }
.pd-event-time { display: block; color: #8a969c; font-size: 12px; margin-top: 4px; }

.pd-notice { background: #fff8ea; border: 1px solid #f1dbb6; border-radius: 14px; padding: 14px; color: #815313; font-size: 13px; line-height: 1.45; }

.pd-detail-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 13px; padding: 8px 0; color: #344640; }
.pd-detail-row--mock { color: #a3aca6; }
.pd-detail-row strong { font-weight: 850; text-align: right; }

@media (max-width: 1100px) {
    .pd-body { grid-template-columns: 1fr; }
}

@media (max-width: 960px) {
    .pd-layout { grid-template-columns: 1fr; }
}

@media (max-width: 760px) {
    .pd-layout { padding-left: 16px; padding-right: 16px; }
    .pd-head { flex-direction: column; align-items: flex-start; }
}
</style>
