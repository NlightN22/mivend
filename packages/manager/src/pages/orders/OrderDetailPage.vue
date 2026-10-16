<script setup lang="ts">
import { useAuthStore } from '../../stores/auth';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { MvPanel, MvStatusBadge, formatDocumentNumber } from '@mivend/ui-kit';
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
import { isNotRegisteredInErp } from '../../composables/isNotRegisteredInErp';
import { formatPackaging, useOrderPackaging } from '../../composables/useOrderPackaging';
import OrderContextPanel from '../../components/order-detail/OrderContextPanel.vue';
import OrderStatusCards from '../../components/order-detail/OrderStatusCards.vue';
import { useOrderChecks } from '../../composables/useOrderChecks';
import OrderLinesTable from '../../components/order-detail/OrderLinesTable.vue';
import PriceAdjustmentHistoryPanel from '../../components/order-detail/PriceAdjustmentHistoryPanel.vue';
import RelatedDocumentsPanel from '../../components/order-detail/RelatedDocumentsPanel.vue';
import OrderPaidAmount from '../../components/order-detail/OrderPaidAmount.vue';
import OrderCancelPanel from '../../components/order-detail/OrderCancelPanel.vue';
import ProformaInvoicesPanel from '../../components/order-detail/ProformaInvoicesPanel.vue';
import PaymentReceivedPanel from '../../components/order-detail/PaymentReceivedPanel.vue';
import OrderContractPanel from '../../components/order-detail/OrderContractPanel.vue';
import OrderErpStatusPanels from '../../components/order-detail/OrderErpStatusPanels.vue';
import ReservationHolds from '../../components/order-detail/ReservationHolds.vue';
import ReservationPanel from '../../components/order-detail/ReservationPanel.vue';

const authStore = useAuthStore();
const route = useRoute();
const order = ref<OrderDetail | null>(null);
const managers = ref<ManagerOption[]>([]);
const adjustmentRequests = ref<PriceAdjustmentRequestSummary[]>([]);
const documents = ref<RelatedDocument[]>([]);
const loading = ref(true);
const notFound = ref(false);
const credit = ref<CustomerCredit | null>(null);
const reservations = ref<OrderReservation[]>([]);
const orderId = computed(() => order.value?.id ?? '');
const checks = useOrderChecks(orderId);
const canSeeChecks = computed(() => authStore.hasPermission('ReadCheckResults'));
const contractPanel = ref<{ $el: HTMLElement } | null>(null);
const contractAnchor = computed(() => contractPanel.value?.$el ?? null);

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

const editable = computed(
    () => !!order.value && !NON_EDITABLE_ORDER_STATES.includes(order.value.state),
);

const packagingLabel = computed(() => {
    if (!order.value) return null;
    return formatPackaging(useOrderPackaging(order.value.lines));
});

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
        [adjustmentRequests.value, documents.value, reservations.value, credit.value] =
            await Promise.all([
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
watch([orderId, reservations], () => {
    if (orderId.value && canSeeChecks.value) void checks.load();
});
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
                <RouterLink to="/orders">Orders</RouterLink> /
                {{ formatDocumentNumber(order.code) }}
            </div>
            <h1 class="order-detail__title">
                {{ formatDocumentNumber(order.code) }}
                <MvStatusBadge variant="info">{{ order.state }}</MvStatusBadge>
                <MvStatusBadge v-if="order.creditLimitExceeded" variant="warning"
                    >Credit limit exceeded</MvStatusBadge
                >
            </h1>
            <p class="order-detail__subtitle">
                Created
                {{ new Date(order.createdAt).toLocaleDateString('en-US') }}
            </p>
        </div>

        <OrderStatusCards
            :findings="canSeeChecks ? checks.findings.value : []"
            :not-registered="isNotRegisteredInErp(order.customFields)"
            :erp-status="order.customFields.erpRegistrationStatus ?? null"
            :can-see-checks="canSeeChecks"
            :can-recompute="canSeeChecks"
            :recomputing="checks.recomputing.value"
            :error="checks.error.value"
            @recompute="checks.recompute"
            @go-to-contract="contractAnchor?.scrollIntoView({ behavior: 'smooth' })"
        />

        <MvPanel title="Order lines">
            <OrderLinesTable
                :order-id="order.id"
                :lines="order.lines"
                :currency-code="order.currencyCode"
                :editable="editable"
                :packages-only="order.packagesOnlySales"
                :adjustment-requests="adjustmentRequests"
                :findings="canSeeChecks ? checks.findings.value : []"
                :reservations="reservations"
                @adjusted="reload"
            />
            <div class="order-detail__totals">
                <span>Subtotal: {{ money(order.subTotalWithTax) }}</span>
                <span>Shipping: {{ money(order.shippingWithTax) }}</span>
                <span v-if="packagingLabel">Weight / volume: {{ packagingLabel }}</span>
                <OrderPaidAmount
                    v-if="order.customFields.erpPaidAmount != null"
                    :paid="money(order.customFields.erpPaidAmount)"
                    :total="money(order.totalWithTax)"
                    :overpaid="
                        order.customFields.erpPaidAmount > order.totalWithTax
                            ? money(order.customFields.erpPaidAmount - order.totalWithTax)
                            : null
                    "
                />
                <strong>Total: {{ money(order.totalWithTax) }}</strong>
            </div>
        </MvPanel>

        <div class="order-detail__panels">
            <MvPanel v-if="adjustmentRequests.length" title="Price adjustment history">
                <PriceAdjustmentHistoryPanel :requests="adjustmentRequests" />
            </MvPanel>

            <PaymentReceivedPanel
                :order-id="order.id"
                :payments="order.payments ?? []"
                @confirmed="reload"
            />
            <ProformaInvoicesPanel :order-id="order.id" :cancelled="order.state === 'Cancelled'" />
            <OrderCancelPanel
                :order-id="order.id"
                :cancellable="order.cancellable"
                @cancelled="reload"
            />
            <OrderErpStatusPanels :order="order" />

            <MvPanel title="Reservation">
                <ReservationPanel
                    :order-id="order.id"
                    :reservations="reservations"
                    :default-reservation-days="defaultReservationDays"
                    @changed="reload"
                />
                <ReservationHolds :order-id="order.id" :refresh-on="reservations" />
            </MvPanel>

            <MvPanel ref="contractPanel" title="Contract">
                <OrderContractPanel
                    :order-id="order.id"
                    :locked="reservations.some(r => r.status === 'active')"
                    @changed="reload"
                />
            </MvPanel>

            <MvPanel title="Order context">
                <OrderContextPanel :order="order" :manager-name="managerName" :credit="credit" />
            </MvPanel>

            <MvPanel title="Documents">
                <RelatedDocumentsPanel :documents="documents" />
            </MvPanel>
        </div>
    </div>
</template>

<style scoped>
.order-detail {
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.order-detail__panels {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 18px;
    align-items: start;
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
    flex-wrap: wrap;
    gap: 8px 20px;
    margin-top: 14px;
    font-size: 13px;
}

.order-detail__not-found {
    padding: 60px 0;
    text-align: center;
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
