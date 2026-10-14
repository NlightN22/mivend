import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { adminApi } from '../api/client';
import { OrderStatusesDocument, type OrderStatusesQuery } from '../api/generated/graphql';

export type OrderStatusInfo = OrderStatusesQuery['orderStatuses'][number];

// The order status dictionary is data; the portal reads attributes (rejected, cancelled, ...), never codes.
export const useOrderStatusesStore = defineStore('orderStatuses', () => {
    const statuses = ref<OrderStatusInfo[]>([]);
    const loaded = ref(false);
    const byCode = computed(() => new Map(statuses.value.map(s => [s.code, s])));
    let inFlight: Promise<void> | null = null;

    function load(): Promise<void> {
        if (loaded.value) return Promise.resolve();
        inFlight ??= adminApi(OrderStatusesDocument)
            .then(result => {
                statuses.value = result.orderStatuses;
                loaded.value = true;
            })
            .finally(() => {
                inFlight = null;
            });
        return inFlight;
    }

    function isRejected(code: string | null | undefined): boolean {
        return code != null && byCode.value.get(code)?.rejected === true;
    }

    const rejectedCodes = computed(() => statuses.value.filter(s => s.rejected).map(s => s.code));

    return { statuses, loaded, load, isRejected, rejectedCodes };
});
