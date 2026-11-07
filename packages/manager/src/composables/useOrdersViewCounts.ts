import { onMounted, ref, type Ref } from 'vue';
import { fetchOrdersViewCounts, type OrdersViewCounts } from '../api/orders-counts';
import { useOrderStatusesStore } from '../stores/orderStatuses';

export interface OrdersViewCountsState {
    counts: Ref<OrdersViewCounts | null>;
    pendingApprovalOrderIds: Ref<Set<string>>;
    refresh: () => Promise<void>;
}

// Chip counts and the price-adjustment flags come in one request; a failure leaves the chips without numbers.
export function useOrdersViewCounts(customerId: string | undefined): OrdersViewCountsState {
    const statuses = useOrderStatusesStore();
    const counts = ref<OrdersViewCounts | null>(null);
    const pendingApprovalOrderIds = ref<Set<string>>(new Set());

    async function refresh(): Promise<void> {
        try {
            await statuses.load();
            const result = await fetchOrdersViewCounts(customerId, statuses.rejectedCodes);
            counts.value = result.counts;
            pendingApprovalOrderIds.value = result.pendingApprovalOrderIds;
        } catch (e) {
            console.warn('[orders] could not load view counts:', e);
        }
    }

    onMounted(() => void refresh());

    return { counts, pendingApprovalOrderIds, refresh };
}
