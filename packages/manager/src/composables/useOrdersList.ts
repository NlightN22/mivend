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
    filters: Ref<OrdersListFilters>;
    sort: Ref<OrdersSort>;
    page: Ref<number>;
    pageSize: Ref<number>;
    managers: Ref<ManagerOption[]>;
    branches: Ref<BranchOption[]>;
}

// Filters, sort, page and page size live in the URL, so a filtered list is a shareable link.
export function useOrdersList(preset: OrdersListPreset): OrdersListState {
    const statuses = useOrderStatusesStore();
    const { fromQuery, toQuery } = useUrlSyncedState(ORDERS_URL_DEFAULTS);

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

    const { loading, run } = useLatestRequest(
        async () => {
            await statuses.load();
            return fetchOrdersList(
                filters.value,
                preset,
                statuses.rejectedCodes,
                page.value,
                pageSize.value,
                { [sort.value.field]: sort.value.dir },
            );
        },
        result => {
            items.value = result.items;
            totalItems.value = result.totalItems;
        },
    );

    watch([filters, sort, pageSize], () => {
        page.value = 1;
    });
    watch([filters, sort, pageSize, page], () => {
        void run();
        toQuery(toUrlState(filters.value, sort.value, pageSize.value), page);
    });

    onMounted(() => {
        void run();
        void fetchManagerOptions().then(result => (managers.value = result));
        void fetchBranchOptions().then(result => (branches.value = result));
    });

    return {
        items,
        totalItems,
        loading,
        filters,
        sort,
        page,
        pageSize,
        managers,
        branches,
    };
}
