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
    managerOrderHref,
    load,
} = useOrderCreated();
</script>

<template>
    <main class="oc-page">
        <MvBreadcrumbs
            :aria-label="$t('common.breadcrumb')"
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
                <MvNotice v-if="awaitingManager" variant="warning">
                    {{
                        limitExceeded
                            ? $t('orderCreated.awaitingManager')
                            : $t('orderCreated.awaitingConfirmation')
                    }}
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
                    <a
                        v-if="managerOrderHref"
                        :href="managerOrderHref"
                        target="_blank"
                        rel="noopener"
                        class="oc-btn oc-btn--secondary"
                        >{{ $t('acting.openInManager') }}</a
                    >
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
    color: var(--app-nav-label);
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
    background: var(--app-surface);
    border: 1.5px solid var(--el-color-primary);
    border-radius: 28px;
    box-shadow: 0 14px 36px var(--app-ink-08);
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
    background: var(--app-brand-fill);
    color: var(--app-on-accent);
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
    color: var(--app-nav-label);
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
    background: var(--app-brand-fill);
    color: var(--app-on-accent);
}
.oc-btn--primary:hover {
    background: var(--app-brand-fill-hover);
}

.oc-btn--secondary {
    background: var(--app-fill-soft);
    color: var(--app-text-deep);
    border: 1px solid var(--app-nav-border-strong);
}
.oc-btn--secondary:hover {
    background: var(--app-nav-border);
}

.oc-btn--ghost {
    background: transparent;
    color: var(--app-nav-label);
    border: 1px solid var(--app-nav-border-strong);
}
.oc-btn--ghost:hover {
    color: var(--app-text-deep);
    background: var(--el-bg-color-page);
}

@media (max-width: 760px) {
    .oc-page {
        padding-left: 16px;
        padding-right: 16px;
    }
}
</style>
