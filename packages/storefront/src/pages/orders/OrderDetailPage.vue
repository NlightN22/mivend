<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { MvButton, MvModal, formatDocumentNumber } from '@mivend/ui-kit';
import AccountSidebar from '../account/AccountSidebar.vue';
import { useCancelOrder } from './useCancelOrder';
import { useOrderDetail } from './useOrderDetail';
import { useRepeatOrderAction } from './useRepeatOrderAction';
import { useOrderStatusesStore } from '../../stores/orderStatuses';
import { formatAmount } from './orderFormat';
import OrderAddressCard from './OrderAddressCard.vue';
import OrderDetailHead from './OrderDetailHead.vue';
import OrderActionsCard from './OrderActionsCard.vue';
import OrderDocumentCard from './OrderDocumentCard.vue';
import OrderHistory from './OrderHistory.vue';
import OrderLinesTable from './OrderLinesTable.vue';
import OrderProformaInvoices from './OrderProformaInvoices.vue';
import OrderSummaryStrip from './OrderSummaryStrip.vue';
import OrderTotalsCard from './OrderTotalsCard.vue';

const route = useRoute();
const { t } = useI18n();
const statuses = useOrderStatusesStore();
const { order, tradingPoints, loading, load } = useOrderDetail();
const { repeating, repeatOrder: repeatLines } = useRepeatOrderAction();

const confirmOpen = ref(false);
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
    await repeatLines(order.value.lines);
}

onMounted(() => {
    void statuses.load();
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
                    <OrderDetailHead
                        :title="title"
                        :created-at="order.createdAt"
                        :code="order.code"
                        :status-code="order.customFields?.erpStatus"
                    />

                    <OrderSummaryStrip
                        :count="order.lines.length"
                        :total="formatAmount(order.totalWithTax, order.currencyCode)"
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
                    <OrderHistory :history="order.statusHistory" />
                </div>

                <aside class="od-aside">
                    <OrderActionsCard
                        :repeating="repeating"
                        :can-cancel="canCancel"
                        :cancel-requested="order.customFields?.cancelRequestStatus === 'REQUESTED'"
                        @repeat="repeatOrder"
                        @cancel="confirmOpen = true"
                    />
                    <OrderTotalsCard :order="order" />
                    <OrderProformaInvoices
                        :order-code="order.code"
                        :cancelled="order.state === 'Cancelled'"
                    />
                    <OrderAddressCard :address="order.shippingAddress" />
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

.od-aside {
    display: grid;
    gap: 14px;
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
}
</style>
