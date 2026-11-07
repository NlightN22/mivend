import { onMounted, ref, watch, type Ref } from 'vue';
import { useDebouncedCallback, useLatestRequest } from '@mivend/ui-kit';
import { fetchOrdersViewCounts, type OrdersViewCounts } from '../api/orders-counts';
import type { OrdersListFilters } from '../api/orders-list';
import { useOrderStatusesStore } from '../stores/orderStatuses';

export interface OrdersViewCountsState {
    counts: Ref<OrdersViewCounts | null>;
    pendingApprovalOrderIds: Ref<Set<string>>;
}

// Chip counts follow the list's search and conditions; a failure keeps the previous numbers.
export function useOrdersViewCounts(
    customerId: string | undefined,
    filters: Ref<OrdersListFilters>,
): OrdersViewCountsState {
    const statuses = useOrderStatusesStore();
    const counts = ref<OrdersViewCounts | null>(null);
    const pendingApprovalOrderIds = ref<Set<string>>(new Set());

    const { run } = useLatestRequest(
        async () => {
            await statuses.load();
            return fetchOrdersViewCounts(filters.value, customerId, statuses.rejectedCodes);
        },
        result => {
            counts.value = result.counts;
            pendingApprovalOrderIds.value = result.pendingApprovalOrderIds;
        },
    );
    function refresh(): void {
        run().catch(e => {
            console.warn('[orders] could not load view counts:', e);
        });
    }
    const refreshSoon = useDebouncedCallback(refresh, 250);

    watch(
        () => [filters.value.search, filters.value.conditions],
        () => refreshSoon(),
    );
    onMounted(refresh);

    return { counts, pendingApprovalOrderIds };
}
