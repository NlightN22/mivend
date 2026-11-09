import { computed, onMounted, ref, watch } from 'vue';
import {
    fetchOrderDetail,
    fetchPriceAdjustmentRequestsForOrder,
    fetchRelatedDocuments,
    type OrderDetail,
    type PriceAdjustmentRequestSummary,
    type RelatedDocument,
} from '../api/orderDetail';
import { fetchManagerOptions, type ManagerOption } from '../api/orders';
import { fetchCreditForCounterparty, type CustomerCredit } from '../api/customers';
import { fetchOrderLineShortfalls, type OrderLineShortfallRow } from '../api/orderLineEdit';
import { fetchOrderReservations, type OrderReservation } from '../api/reservation';

export function useOrderDetail(code: () => string) {
    const order = ref<OrderDetail | null>(null);
    const managers = ref<ManagerOption[]>([]);
    const adjustmentRequests = ref<PriceAdjustmentRequestSummary[]>([]);
    const documents = ref<RelatedDocument[]>([]);
    const loading = ref(true);
    const notFound = ref(false);
    const credit = ref<CustomerCredit | null>(null);
    const reservations = ref<OrderReservation[]>([]);
    const shortfalls = ref<OrderLineShortfallRow[]>([]);

    const managerName = computed(() => {
        const managerId = order.value?.counterparty?.assignedManagerId;
        if (!managerId) return null;
        return managers.value.find(m => m.id === managerId)?.name ?? null;
    });

    async function load(): Promise<void> {
        loading.value = true;
        notFound.value = false;
        try {
            const [detail, managerOptions] = await Promise.all([
                fetchOrderDetail(code()),
                managers.value.length ? Promise.resolve(managers.value) : fetchManagerOptions(),
            ]);
            managers.value = managerOptions;
            if (!detail) {
                notFound.value = true;
                return;
            }
            order.value = detail;
            const counterpartyId = detail.counterparty?.id;
            [
                adjustmentRequests.value,
                documents.value,
                reservations.value,
                shortfalls.value,
                credit.value,
            ] = await Promise.all([
                fetchPriceAdjustmentRequestsForOrder(detail.id),
                fetchRelatedDocuments(detail.id),
                fetchOrderReservations(detail.id),
                fetchOrderLineShortfalls(detail.id),
                counterpartyId ? fetchCreditForCounterparty(counterpartyId) : Promise.resolve(null),
            ]);
        } finally {
            loading.value = false;
        }
    }

    async function reload(): Promise<void> {
        if (!order.value) return;
        const [detail, requests, reservationRows, shortfallRows] = await Promise.all([
            fetchOrderDetail(order.value.code),
            fetchPriceAdjustmentRequestsForOrder(order.value.id),
            fetchOrderReservations(order.value.id),
            fetchOrderLineShortfalls(order.value.id),
        ]);
        shortfalls.value = shortfallRows;
        order.value = detail;
        adjustmentRequests.value = requests;
        reservations.value = reservationRows;
    }

    onMounted(load);
    watch(code, load);

    return {
        order,
        managerName,
        adjustmentRequests,
        documents,
        loading,
        notFound,
        credit,
        reservations,
        shortfalls,
        load,
        reload,
    };
}

export type OrderDetailData = ReturnType<typeof useOrderDetail>;
