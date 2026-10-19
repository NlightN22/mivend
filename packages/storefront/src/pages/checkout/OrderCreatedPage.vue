<script setup lang="ts">
import { IconCheck } from '@tabler/icons-vue';
import { MvErrorState } from '@mivend/ui-kit';
import ProformaInvoiceVersionBadge from '../proforma-invoices/ProformaInvoiceVersionBadge.vue';
import OrderCreatedDetails from './OrderCreatedDetails.vue';
import { useOrderCreated } from './useOrderCreated';

const {
    loading,
    error,
    order,
    text,
    awaitingManager,
    limitExceeded,
    proformaInvoices,
    placedAt,
    tradingPoint,
    paymentLabel,
    delivery,
    load,
} = useOrderCreated();
</script>

<template>
    <main class="oc-page">
        <MvBreadcrumbs
            class="oc-crumbs"
            :items="[
                { label: $t('nav.cart'), to: '/cart' },
                { label: $t('checkout.title'), to: '/checkout' },
                { label: $t('orderCreated.title') },
            ]"
        />

        <div class="oc-head">
            <h1 class="oc-title">{{ $t('orderCreated.title') }}</h1>
        </div>

        <div v-if="loading" class="oc-state">{{ $t('orderCreated.loading') }}</div>
        <MvErrorState
            v-else-if="error"
            :title="error.title"
            :message="error.message"
            @retry="load"
        />
        <MvNotice v-else-if="!order" variant="error">{{ $t('orders.detail.notFound') }}</MvNotice>

        <template v-else>
            <div class="oc-status-card">
                <div class="oc-check">
                    <IconCheck :size="32" stroke-width="3" aria-hidden="true" />
                </div>
                <h2 class="oc-status-title">{{ $t('orderCreated.statusTitle') }}</h2>
                <p class="oc-status-text">{{ text.status }}</p>
                <MvNotice v-if="text.waitingForCashConfirmation" variant="info">
                    {{ $t('orderCreated.waitingCash') }}
                </MvNotice>
                <MvNotice v-if="awaitingManager" variant="warning">
                    {{ $t('orderCreated.awaitingManager') }}
                </MvNotice>
                <MvNotice v-else-if="limitExceeded" variant="warning">
                    {{ $t('orderCreated.limitAcknowledged') }}
                </MvNotice>
                <div class="oc-actions">
                    <RouterLink :to="`/orders/${order.id}`" class="oc-btn oc-btn--primary">{{
                        $t('orderCreated.openOrder')
                    }}</RouterLink>
                    <a
                        v-for="proformaInvoice in proformaInvoices"
                        :key="proformaInvoice.id"
                        :href="proformaInvoice.href"
                        target="_blank"
                        rel="noopener"
                        class="oc-btn oc-btn--secondary"
                        >{{ $t('orderCreated.printProforma', { number: proformaInvoice.number }) }}
                        <ProformaInvoiceVersionBadge :version="proformaInvoice.version"
                    /></a>
                    <RouterLink to="/catalog" class="oc-btn oc-btn--ghost">{{
                        $t('orderCreated.continueShopping')
                    }}</RouterLink>
                </div>
            </div>

            <OrderCreatedDetails
                :code="order.code"
                :placed-at="placedAt"
                :trading-point="tradingPoint"
                :payment-label="paymentLabel"
                :delivery="delivery"
                :steps="text.steps"
            />
        </template>
    </main>
</template>

<style scoped>
.oc-state {
    padding: 40px 0;
    color: #66736e;
}

.oc-page {
    max-width: 1440px;
    margin: 0 auto;
    padding: 24px 28px 70px;
}

.oc-crumbs {
    margin-bottom: 12px;
}

.oc-head {
    margin-bottom: 24px;
}

.oc-title {
    margin: 0;
    font-size: clamp(36px, 3.8vw, 54px);
    line-height: 0.98;
    letter-spacing: -0.06em;
}

.oc-status-card {
    max-width: 600px;
    margin: 0 auto 24px;
    background: #fff;
    border: 1.5px solid #00a878;
    border-radius: 28px;
    box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
    padding: 36px 32px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
}

.oc-check {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: #00a878;
    color: #fff;
    font-size: 28px;
    font-weight: 900;
    display: grid;
    place-items: center;
    margin-bottom: 16px;
}

.oc-status-title {
    margin: 0 0 8px;
    font-size: 24px;
    font-weight: 950;
    letter-spacing: -0.04em;
}

.oc-status-text {
    margin: 0 0 22px;
    color: #66736e;
    font-size: 14px;
    line-height: 1.5;
}

.oc-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: center;
}

.oc-btn {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 20px;
    border-radius: 14px;
    font: inherit;
    font-size: 14px;
    font-weight: 800;
    text-decoration: none;
    cursor: pointer;
    transition: 0.14s;
    border: none;
}

.oc-btn--primary {
    background: #00a878;
    color: #fff;
}
.oc-btn--primary:hover {
    background: #008a64;
}

.oc-btn--secondary {
    background: #f3f8f6;
    color: #263732;
    border: 1px solid #dde7e2;
}
.oc-btn--secondary:hover {
    background: #e8f2ed;
}

.oc-btn--ghost {
    background: transparent;
    color: #66736e;
    border: 1px solid #dde7e2;
}
.oc-btn--ghost:hover {
    color: #263732;
    background: #f4faf7;
}

@media (max-width: 760px) {
    .oc-page {
        padding-left: 16px;
        padding-right: 16px;
    }
}
</style>
