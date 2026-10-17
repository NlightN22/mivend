import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { shopApi } from '../api/client';
import { OrderStatusesDocument, type OrderStatusesQuery } from '../api/generated/graphql';

export type OrderStatusInfo = OrderStatusesQuery['orderStatuses'][number];
export type StatusBadgeVariant = 'default' | 'warning' | 'muted' | 'error';

// The order status dictionary is data (ERP reference + mivend pipeline rows), never a frontend list:
// labels, filter groups and badge colors are all derived from its attributes.
export const useOrderStatusesStore = defineStore('orderStatuses', () => {
    const statuses = ref<OrderStatusInfo[]>([]);
    const loaded = ref(false);
    const byCode = computed(() => new Map(statuses.value.map(s => [s.code, s])));
    let inFlight: Promise<void> | null = null;

    function load(): Promise<void> {
        if (loaded.value) return Promise.resolve();
        inFlight ??= shopApi(OrderStatusesDocument)
            .then(result => {
                statuses.value = result.orderStatuses;
                loaded.value = true;
            })
            .finally(() => {
                inFlight = null;
            });
        return inFlight;
    }

    function label(code: string | null | undefined): string {
        return (code && byCode.value.get(code)?.name) || code || '';
    }

    function variant(code: string | null | undefined): StatusBadgeVariant {
        const status = code ? byCode.value.get(code) : undefined;
        if (!status) return 'default';
        if (status.cancelled || status.rejected) return 'error';
        if (status.terminal) return 'muted';
        return status.customerGroup === 'pending' ? 'warning' : 'default';
    }

    function groupOf(code: string | null | undefined): string | null {
        return (code && byCode.value.get(code)?.customerGroup) || null;
    }

    function codesInGroups(groups: string[]): string[] {
        return statuses.value
            .filter(s => s.customerGroup && groups.includes(s.customerGroup))
            .map(s => s.code);
    }

    const finalCodes = computed(() => statuses.value.filter(s => s.terminal).map(s => s.code));

    // Dictionary (rank) order; a group of only rejected or hidden statuses gets no tab.
    const groups = computed(() => {
        const tabs = new Map<string, { key: string; label: string }>();
        for (const s of statuses.value) {
            if (!s.customerVisible || s.rejected || !s.customerGroup) continue;
            if (!tabs.has(s.customerGroup))
                tabs.set(s.customerGroup, { key: s.customerGroup, label: s.name });
        }
        return [...tabs.values()];
    });

    return { statuses, loaded, load, label, groupOf, variant, codesInGroups, finalCodes, groups };
});
