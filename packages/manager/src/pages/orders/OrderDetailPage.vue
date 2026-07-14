<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { MvPanel, MvStatusBadge } from '@mivend/ui-kit';
import {
    fetchOrderDetail,
    fetchPriceAdjustmentRequestsForOrder,
    fetchRelatedDocuments,
    NON_EDITABLE_ORDER_STATES,
    type OrderDetail,
    type PriceAdjustmentRequestSummary,
    type RelatedDocument,
} from '../../api/orderDetail';
import { fetchManagerOptions, type ManagerOption } from '../../api/orders';
import { fetchCreditForCounterparty, type CustomerCredit } from '../../api/customers';
import { fetchOrderReservations, type OrderReservation } from '../../api/reservation';
import OrderContextPanel from '../../components/order-detail/OrderContextPanel.vue';
import OrderLinesTable from '../../components/order-detail/OrderLinesTable.vue';
import PriceAdjustmentHistoryPanel from '../../components/order-detail/PriceAdjustmentHistoryPanel.vue';
import RelatedDocumentsPanel from '../../components/order-detail/RelatedDocumentsPanel.vue';
import ReservationPanel from '../../components/order-detail/ReservationPanel.vue';

const route = useRoute();
const order = ref<OrderDetail | null>(null);
const managers = ref<ManagerOption[]>([]);
const adjustmentRequests = ref<PriceAdjustmentRequestSummary[]>([]);
const documents = ref<RelatedDocument[]>([]);
const loading = ref(true);
const notFound = ref(false);
const credit = ref<CustomerCredit | null>(null);
const reservations = ref<OrderReservation[]>([]);

// Mirrors DEFAULT_RESERVATION_DAYS in packages/plugins/reservation/src/types.ts — used only as
// the form's initial value before an order's own customFields.reservationDays default loads.
const FALLBACK_RESERVATION_DAYS = 3;
const defaultReservationDays = computed(
    () => order.value?.customFields.reservationDays ?? FALLBACK_RESERVATION_DAYS,
);

const managerName = computed(() => {
    const managerId = order.value?.customer?.counterparty?.assignedManagerId;
    if (!managerId) return null;
    return managers.value.find(m => m.id === managerId)?.name ?? null;
});

const editable = computed(() => !!order.value && !NON_EDITABLE_ORDER_STATES.includes(order.value.state));

function money(amount: number): string {
    if (!order.value) return '';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: order.value.currencyCode,
    }).format(amount / 100);
}

async function load(): Promise<void> {
    loading.value = true;
    notFound.value = false;
    try {
        const code = route.params.code as string;
        const [detail, managerOptions] = await Promise.all([
            fetchOrderDetail(code),
            managers.value.length ? Promise.resolve(managers.value) : fetchManagerOptions(),
        ]);
        managers.value = managerOptions;
        if (!detail) {
            notFound.value = true;
            return;
        }
        order.value = detail;
        const counterpartyId = detail.customer?.counterparty?.id;
        [adjustmentRequests.value, documents.value, reservations.value, credit.value] = await Promise.all([
            fetchPriceAdjustmentRequestsForOrder(detail.id),
            fetchRelatedDocuments(detail.id),
            fetchOrderReservations(detail.id),
            counterpartyId ? fetchCreditForCounterparty(counterpartyId) : Promise.resolve(null),
        ]);
    } finally {
        loading.value = false;
    }
}

async function reload(): Promise<void> {
    if (!order.value) return;
    const [detail, requests, reservationRows] = await Promise.all([
        fetchOrderDetail(order.value.code),
        fetchPriceAdjustmentRequestsForOrder(order.value.id),
        fetchOrderReservations(order.value.id),
    ]);
    order.value = detail;
    adjustmentRequests.value = requests;
    reservations.value = reservationRows;
}

onMounted(load);
watch(() => route.params.code, load);
</script>

<template>
    <div v-if="notFound" class="order-detail__not-found">
        <h1>Order not found</h1>
        <RouterLink to="/orders">Back to orders</RouterLink>
    </div>

    <div v-else-if="order" class="order-detail">
        <div class="order-detail__header">
            <div class="order-detail__breadcrumb">
                <RouterLink to="/orders">Orders</RouterLink> / {{ order.code }}
            </div>
            <h1 class="order-detail__title">
                {{ order.code }}
                <MvStatusBadge variant="info">{{ order.state }}</MvStatusBadge>
            </h1>
            <p class="order-detail__subtitle">
                Placed
                {{ order.orderPlacedAt ? new Date(order.orderPlacedAt).toLocaleDateString('en-US') : '—' }}
            </p>
        </div>

        <div class="order-detail__grid">
            <div class="order-detail__left-stack">
                <MvPanel title="Order lines">
                    <OrderLinesTable
                        :order-id="order.id"
                        :lines="order.lines"
                        :currency-code="order.currencyCode"
                        :editable="editable"
                        :adjustment-requests="adjustmentRequests"
                        @adjusted="reload"
                    />
                    <div class="order-detail__totals">
                        <span>Subtotal: {{ money(order.subTotalWithTax) }}</span>
                        <span>Shipping: {{ money(order.shippingWithTax) }}</span>
                        <strong>Total: {{ money(order.totalWithTax) }}</strong>
                    </div>
                </MvPanel>

                <MvPanel v-if="adjustmentRequests.length" title="Price adjustment history">
                    <PriceAdjustmentHistoryPanel :requests="adjustmentRequests" />
                </MvPanel>
            </div>

            <aside class="order-detail__right-stack">
                <MvPanel title="Reservation">
                    <ReservationPanel
                        :order-id="order.id"
                        :reservations="reservations"
                        :default-reservation-days="defaultReservationDays"
                        @changed="reload"
                    />
                </MvPanel>

                <MvPanel title="Order context">
                    <OrderContextPanel :order="order" :manager-name="managerName" :credit="credit" />
                </MvPanel>

                <MvPanel title="Documents">
                    <RelatedDocumentsPanel :documents="documents" />
                </MvPanel>
            </aside>
        </div>
    </div>
</template>

<style scoped>
.order-detail {
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.order-detail__grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: 18px;
    align-items: start;
}

.order-detail__left-stack,
.order-detail__right-stack {
    display: grid;
    gap: 18px;
    min-width: 0;
}

@media (max-width: 1200px) {
    .order-detail__grid {
        grid-template-columns: 1fr;
    }
}

.order-detail__breadcrumb {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
    margin-bottom: 6px;
}

.order-detail__breadcrumb a {
    color: inherit;
    text-decoration: none;
}

.order-detail__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
    display: flex;
    align-items: center;
    gap: 12px;
}

.order-detail__subtitle {
    margin: 8px 0 0;
    color: var(--el-text-color-secondary, #6b7280);
}

.order-detail__totals {
    display: flex;
    justify-content: flex-end;
    gap: 20px;
    margin-top: 14px;
    font-size: 13px;
}

.order-detail__not-found {
    padding: 60px 0;
    text-align: center;
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
