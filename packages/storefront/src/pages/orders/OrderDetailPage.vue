<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { MvButton, MvCopyButton, MvModal, toast, formatDocumentNumber } from '@mivend/ui-kit';
import AccountSidebar from '../account/AccountSidebar.vue';
import { useAuthStore } from '../../stores/auth';
import { useCancelOrder } from './useCancelOrder';
import { useOrderDetail } from './useOrderDetail';
import { useRepeatOrder } from './useRepeatOrder';
import { STATUS_VARIANT } from './useOrders';
import { formatAmount, formatDate } from './orderFormat';
import OrderActionsCard from './OrderActionsCard.vue';
import OrderDocumentCard from './OrderDocumentCard.vue';
import OrderLinesTable from './OrderLinesTable.vue';
import OrderProformaInvoices from './OrderProformaInvoices.vue';
import OrderSummaryStrip from './OrderSummaryStrip.vue';
import OrderTotalsCard from './OrderTotalsCard.vue';

const route = useRoute();
const { t } = useI18n();
const auth = useAuthStore();
const { order, tradingPoints, loading, load } = useOrderDetail();
const { repeating, repeat } = useRepeatOrder();

const confirmOpen = ref(false);
const pageUrl = (): string => window.location.href;
const title = computed(() =>
    order.value ? t('orders.detail.title', { number: formatDocumentNumber(order.value.code) }) : '',
);
const { cancelling, refusalReason, failed, canCancel, cancel } = useCancelOrder(
    () => order.value?.code,
    () => order.value?.cancellable,
    () => load(route.params.id as string),
);

const pickupPoint = computed(() => {
    const id = order.value?.customFields?.tradingPointId;
    const point = tradingPoints.value.find(p => p.id === id);
    return point?.name ?? null;
});

async function confirmCancel(): Promise<void> {
    await cancel();
    confirmOpen.value = false;
}

async function repeatOrder(): Promise<void> {
    if (!order.value) return;
    const { added, skipped } = await repeat(order.value.lines);
    if (added) toast(t('orders.detail.repeatDone', { added }), 'success');
    if (skipped) toast(t('orders.detail.repeatSkipped', { skipped }), 'error');
}

onMounted(() => {
    void load(route.params.id as string);
});
</script>

<template>
    <div class="od-layout">
        <AccountSidebar />

        <section class="od-content">
            <router-link to="/orders" class="od-back">{{ t('orders.detail.back') }}</router-link>

            <div v-if="loading" class="od-state">{{ t('orders.detail.loading') }}</div>

            <div v-else-if="!order" class="od-state">{{ t('orders.detail.notFound') }}</div>

            <div v-else class="od-body">
                <div class="od-main">
                    <div class="od-head">
                        <div>
                            <h1 class="od-title">
                                {{ title }}
                                <MvCopyButton
                                    :value="formatDocumentNumber(order.code)"
                                    :label="t('orders.detail.copyNumber')"
                                />
                            </h1>
                            <div class="od-meta">{{ formatDate(order.createdAt) }}</div>
                        </div>
                        <div class="od-head-side">
                            <MvCopyButton
                                :value="pageUrl"
                                icon="link"
                                :label="t('orders.detail.copyLink')"
                            />
                            <span
                                class="od-status"
                                :class="STATUS_VARIANT[order.customFields?.erpStatus ?? 'PENDING']"
                            >
                                {{
                                    t(
                                        `orders.statusLabel.${order.customFields?.erpStatus ?? 'PENDING'}`,
                                    )
                                }}
                            </span>
                        </div>
                    </div>

                    <OrderSummaryStrip
                        :count="order.lines.length"
                        :total="formatAmount(order.totalWithTax, order.currencyCode)"
                        :organization="auth.counterparty?.fullName ?? null"
                        :pickup-point="pickupPoint"
                    />

                    <div v-if="refusalReason" class="od-cancel-msg">
                        {{ t(`orders.cancel.refused.${refusalReason}`) }}
                    </div>
                    <div v-else-if="failed" class="od-cancel-msg">
                        {{ t('orders.cancel.failed') }}
                    </div>

                    <MvModal
                        v-if="confirmOpen"
                        :title="t('orders.cancel.confirmTitle')"
                        @close="confirmOpen = false"
                    >
                        <p>{{ t('orders.cancel.confirmText') }}</p>
                        <div class="od-cancel">
                            <MvButton variant="secondary" @click="confirmOpen = false">{{
                                t('orders.cancel.keep')
                            }}</MvButton>
                            <MvButton
                                variant="danger"
                                :loading="cancelling"
                                @click="confirmCancel"
                                >{{ t('orders.cancel.confirm') }}</MvButton
                            >
                        </div>
                    </MvModal>

                    <OrderLinesTable :order="order" />
                </div>

                <aside class="od-aside">
                    <OrderActionsCard
                        :repeating="repeating"
                        :can-cancel="canCancel"
                        @repeat="repeatOrder"
                        @cancel="confirmOpen = true"
                    />
                    <OrderTotalsCard :order="order" />
                    <OrderProformaInvoices
                        :order-code="order.code"
                        :cancelled="order.state === 'Cancelled'"
                    />
                    <div
                        v-if="order.shippingAddress?.streetLine1 || order.shippingAddress?.fullName"
                        class="od-address-card"
                    >
                        <h2 class="od-section-title">
                            {{ t('orders.detail.deliveryAddress') }}
                        </h2>
                        <div class="od-address-line">{{ order.shippingAddress.fullName }}</div>
                        <div class="od-address-line">
                            {{ order.shippingAddress.streetLine1 }}
                        </div>
                        <div v-if="order.shippingAddress.streetLine2" class="od-address-line">
                            {{ order.shippingAddress.streetLine2 }}
                        </div>
                        <div class="od-address-line">
                            {{
                                [order.shippingAddress.city, order.shippingAddress.postalCode]
                                    .filter(Boolean)
                                    .join(', ')
                            }}
                        </div>
                    </div>
                    <OrderDocumentCard :order="order" />
                </aside>
            </div>
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

.od-content {
    min-width: 0;
}

.od-back {
    display: inline-block;
    margin-bottom: 18px;
    color: #66736e;
    font-size: 14px;
    font-weight: 850;
    text-decoration: none;
}
.od-back:hover {
    color: #00a878;
}

.od-state {
    color: #66736e;
    font-size: 14px;
    padding: 32px 0;
    text-align: center;
}

.od-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 24px;
}

.od-head-side {
    display: flex;
    align-items: center;
    gap: 8px;
}

.od-title {
    margin: 0 0 4px;
    font-size: clamp(24px, 2.5vw, 36px);
    font-weight: 950;
    letter-spacing: -0.045em;
}

.od-meta {
    color: #66736e;
    font-size: 13px;
}

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
.od-status.muted {
    background: #eef4f1;
    color: #5f6e68;
}
.od-status.warning {
    background: #fff4e3;
    color: #a45e00;
}
.od-status.error {
    background: #ffeeed;
    color: #c0362c;
}

.od-cancel {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
}
.od-cancel-msg {
    margin-bottom: 16px;
    color: #c0362c;
    font-size: 14px;
}

.od-main {
    display: grid;
    gap: 0;
    min-width: 0;
}

.od-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 22px;
    align-items: start;
}

.od-section-title {
    margin: 0 0 14px;
    font-size: 16px;
    font-weight: 950;
    letter-spacing: -0.03em;
}

.od-aside {
    display: grid;
    gap: 14px;
}

.od-address-card {
    background: #fff;
    border: 1px solid #edf2ef;
    border-radius: 20px;
    padding: 18px 20px;
}

.od-address-line {
    font-size: 13px;
    color: #344640;
    line-height: 1.55;
}

@media (max-width: 1100px) {
    .od-body {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 960px) {
    .od-layout {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 760px) {
    .od-layout {
        padding-left: 16px;
        padding-right: 16px;
    }
    .od-head {
        flex-direction: column;
        align-items: flex-start;
    }
}
</style>
