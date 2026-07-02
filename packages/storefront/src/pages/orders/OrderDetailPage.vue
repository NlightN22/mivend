<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute } from 'vue-router';
import AccountSidebar from '../account/AccountSidebar.vue';
import { useOrderDetail } from './useOrderDetail';
import { STATUS_LABEL, STATUS_VARIANT } from './useOrders';

const route = useRoute();
const { order, loading, load } = useOrderDetail();

onMounted(() => { void load(route.params.id as string); });

function formatAmount(cents: number, currency: string): string {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(cents / 100)
        + ' ' + (currency === 'RUB' ? '₽' : currency);
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('ru-RU', {
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}
</script>

<template>
    <div class="od-layout">
        <AccountSidebar />

        <section class="od-content">
            <router-link to="/orders" class="od-back">← My orders</router-link>

            <div v-if="loading" class="od-state">Loading...</div>

            <div v-else-if="!order" class="od-state">Order not found.</div>

            <template v-else>
                <div class="od-head">
                    <div>
                        <h1 class="od-title">Order {{ order.code }}</h1>
                        <div class="od-meta">{{ formatDate(order.createdAt) }}</div>
                    </div>
                    <span
                        class="od-status"
                        :class="STATUS_VARIANT[order.customFields.erpStatus ?? 'PENDING']"
                    >
                        {{ STATUS_LABEL[order.customFields.erpStatus ?? 'PENDING'] }}
                    </span>
                </div>

                <div class="od-body">
                    <div class="od-lines">
                        <h2 class="od-section-title">Order items</h2>
                        <table class="od-table">
                            <thead>
                                <tr>
                                    <th>SKU</th>
                                    <th>Product</th>
                                    <th class="od-th-num">Qty</th>
                                    <th class="od-th-num">Price</th>
                                    <th class="od-th-num">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="line in order.lines" :key="line.id" class="od-row">
                                    <td class="od-sku">{{ line.productVariant.sku }}</td>
                                    <td>{{ line.productVariant.product.name }}</td>
                                    <td class="od-num">{{ line.quantity }}</td>
                                    <td class="od-num">{{ formatAmount(line.unitPriceWithTax, order.currencyCode) }}</td>
                                    <td class="od-num od-bold">{{ formatAmount(line.linePriceWithTax, order.currencyCode) }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <aside class="od-aside">
                        <div class="od-summary-card">
                            <h2 class="od-section-title">Summary</h2>
                            <div class="od-summary-row">
                                <span>Subtotal</span>
                                <span>{{ formatAmount(order.subTotalWithTax, order.currencyCode) }}</span>
                            </div>
                            <div class="od-summary-row">
                                <span>Shipping</span>
                                <span>{{ formatAmount(order.shippingWithTax, order.currencyCode) }}</span>
                            </div>
                            <div class="od-summary-row od-summary-total">
                                <span>Total</span>
                                <span>{{ formatAmount(order.totalWithTax, order.currencyCode) }}</span>
                            </div>
                        </div>

                        <div v-if="order.shippingAddress" class="od-address-card">
                            <h2 class="od-section-title">Delivery address</h2>
                            <div class="od-address-line">{{ order.shippingAddress.fullName }}</div>
                            <div class="od-address-line">{{ order.shippingAddress.streetLine1 }}</div>
                            <div v-if="order.shippingAddress.streetLine2" class="od-address-line">
                                {{ order.shippingAddress.streetLine2 }}
                            </div>
                            <div class="od-address-line">
                                {{ [order.shippingAddress.city, order.shippingAddress.postalCode].filter(Boolean).join(', ') }}
                            </div>
                        </div>

                        <div v-if="order.customFields.erpOrderId || order.customFields.erpStatus" class="od-erp-card">
                            <h2 class="od-section-title">ERP</h2>
                            <div v-if="order.customFields.erpOrderId" class="od-erp-row">
                                <span>ERP ID</span>
                                <span class="od-erp-val">{{ order.customFields.erpOrderId }}</span>
                            </div>
                            <div v-if="order.customFields.erpStatusAt" class="od-erp-row">
                                <span>Updated</span>
                                <span class="od-erp-val">{{ formatDate(order.customFields.erpStatusAt) }}</span>
                            </div>
                        </div>
                    </aside>
                </div>
            </template>
        </section>
    </div>
</template>

<style scoped>
.od-layout {
    display: grid;
    grid-template-columns: 250px minmax(0, 1fr);
    gap: 24px;
    align-items: start;
    max-width: 1440px;
    margin: 0 auto;
    padding: 24px 28px 56px;
}

.od-content { min-width: 0; }

.od-back {
    display: inline-block;
    margin-bottom: 18px;
    color: #66736e;
    font-size: 14px;
    font-weight: 850;
    text-decoration: none;
}
.od-back:hover { color: #00a878; }

.od-state { color: #66736e; font-size: 14px; padding: 32px 0; text-align: center; }

.od-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 24px;
}

.od-title {
    margin: 0 0 4px;
    font-size: clamp(24px, 2.5vw, 36px);
    font-weight: 950;
    letter-spacing: -0.045em;
}

.od-meta { color: #66736e; font-size: 13px; }

.od-status {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    min-height: 32px;
    padding: 0 12px;
    border-radius: 999px;
    background: #e2f8ef;
    color: #008a64;
    font-size: 13px;
    font-weight: 950;
    white-space: nowrap;
}
.od-status.muted { background: #eef4f1; color: #5f6e68; }
.od-status.warning { background: #fff4e3; color: #a45e00; }
.od-status.error { background: #ffeeed; color: #c0362c; }

.od-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: 22px;
    align-items: start;
}

.od-section-title {
    margin: 0 0 14px;
    font-size: 16px;
    font-weight: 950;
    letter-spacing: -0.03em;
}

.od-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}

.od-table th {
    text-align: left;
    padding: 8px 10px;
    border-bottom: 2px solid #edf2ef;
    color: #66736e;
    font-weight: 850;
    font-size: 12px;
}

.od-th-num { text-align: right; }

.od-row td {
    padding: 10px 10px;
    border-bottom: 1px solid #f3f8f6;
    vertical-align: middle;
}

.od-sku { color: #66736e; font-size: 12px; font-weight: 850; white-space: nowrap; }
.od-num { text-align: right; white-space: nowrap; }
.od-bold { font-weight: 950; }

.od-aside { display: grid; gap: 14px; }

.od-summary-card,
.od-address-card,
.od-erp-card {
    background: #fff;
    border: 1px solid #edf2ef;
    border-radius: 20px;
    padding: 18px 20px;
}

.od-summary-row {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    padding: 5px 0;
    color: #344640;
}

.od-summary-total {
    margin-top: 8px;
    padding-top: 12px;
    border-top: 1px solid #edf2ef;
    font-weight: 950;
    font-size: 16px;
}

.od-address-line { font-size: 13px; color: #344640; line-height: 1.55; }

.od-erp-row {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    padding: 3px 0;
    color: #66736e;
}
.od-erp-val { font-weight: 850; color: #344640; }

@media (max-width: 1100px) {
    .od-body { grid-template-columns: 1fr; }
}

@media (max-width: 960px) {
    .od-layout { grid-template-columns: 1fr; }
}

@media (max-width: 760px) {
    .od-layout { padding-left: 16px; padding-right: 16px; }
    .od-head { flex-direction: column; align-items: flex-start; }
}
</style>
