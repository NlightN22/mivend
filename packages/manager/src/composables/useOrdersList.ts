import { onMounted, ref, shallowRef, watch, type Ref } from 'vue';
import { useLatestRequest } from '@mivend/ui-kit';
import {
    fetchBranchOptions,
    fetchManagerOptions,
    type BranchOption,
    type ManagerOption,
    type OrderListItem,
} from '../api/orders';
import { fetchOrdersList, type OrdersListFilters, type OrdersListPreset } from '../api/orders-list';
import { useOrderStatusesStore } from '../stores/orderStatuses';
import { useUrlSyncedState } from './useUrlSyncedState';
import {
    ORDERS_URL_DEFAULTS,
    fromUrlState,
    toUrlState,
    type OrdersListUrlState,
    type OrdersSort,
} from './ordersListUrl';

export interface OrdersListState {
    items: Ref<OrderListItem[]>;
    totalItems: Ref<number>;
    loading: Ref<boolean>;
    failed: Ref<boolean>;
    reload: () => void;
    filters: Ref<OrdersListFilters>;
    sort: Ref<OrdersSort>;
    page: Ref<number>;
    pageSize: Ref<number>;
    managers: Ref<ManagerOption[]>;
    branches: Ref<BranchOption[]>;
}

// Filters, sort, page and page size live in the URL, so a filtered list is a shareable link.
// urlPrefix namespaces the keys of a list embedded in a tab.
export function useOrdersList(preset: OrdersListPreset, urlPrefix = ''): OrdersListState {
    const statuses = useOrderStatusesStore();
    const { fromQuery, toQuery } = useUrlSyncedState(ORDERS_URL_DEFAULTS, urlPrefix);

    const items = ref<OrderListItem[]>([]);
    const totalItems = ref(0);
    const managers = ref<ManagerOption[]>([]);
    const branches = ref<BranchOption[]>([]);

    const urlState: OrdersListUrlState = { ...ORDERS_URL_DEFAULTS };
    const page = ref(1);
    fromQuery(urlState, page);
    const initial = fromUrlState(urlState);
    const filters = shallowRef<OrdersListFilters>(initial.filters);
    const sort = ref<OrdersSort>(initial.sort);
    const pageSize = ref(initial.pageSize);

    const failed = ref(false);
    const { loading, run } = useLatestRequest(
        async () => {
            try {
                await statuses.load();
                return await fetchOrdersList(
                    filters.value,
                    preset,
                    statuses.rejectedCodes,
                    page.value,
                    pageSize.value,
                    { [sort.value.field]: sort.value.dir },
                );
            } catch (e) {
                console.warn('[orders] could not load the list:', e);
                return null;
            }
        },
        result => {
            failed.value = result === null;
            items.value = result?.items ?? [];
            totalItems.value = result?.totalItems ?? 0;
        },
    );
    const reload = (): void => void run();

    watch([filters, sort, pageSize], () => {
        page.value = 1;
    });
    watch([filters, sort, pageSize, page], () => {
        reload();
        toQuery(toUrlState(filters.value, sort.value, pageSize.value), page);
    });

    onMounted(() => {
        reload();
        void fetchManagerOptions().then(result => (managers.value = result));
        void fetchBranchOptions().then(result => (branches.value = result));
    });

    return {
        items,
        totalItems,
        loading,
        failed,
        reload,
        filters,
        sort,
        page,
        pageSize,
        managers,
        branches,
    };
}
