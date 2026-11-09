import { onMounted, ref, shallowRef, watch, type Ref } from 'vue';
import { useDebouncedCallback, useLatestRequest } from '@mivend/ui-kit';
import {
    fetchDiscountViewCounts,
    fetchDiscountsList,
    type DiscountRegistryItem,
    type DiscountsListFilters,
    type DiscountsSort,
    type DiscountsViewCounts,
} from '../api/discountsList';
import { conditionsToDiscountsFilter } from '../api/discountsFilter';
import { useUrlSyncedState } from './useUrlSyncedState';
import {
    DISCOUNTS_URL_DEFAULTS,
    fromDiscountsUrlState,
    toDiscountsUrlState,
    type DiscountsUrlState,
} from './discountsListUrl';

export interface DiscountsListState {
    items: Ref<DiscountRegistryItem[]>;
    names: Ref<Map<string, string>>;
    totalItems: Ref<number>;
    loading: Ref<boolean>;
    failed: Ref<boolean>;
    reload: () => void;
    filters: Ref<DiscountsListFilters>;
    sort: Ref<DiscountsSort>;
    page: Ref<number>;
    pageSize: Ref<number>;
    counts: Ref<DiscountsViewCounts | null>;
    countsLoading: Ref<boolean>;
}

// Search, view, builder conditions, sort, page and page size live in the URL, so a filtered list is a link.
export function useDiscountsList(): DiscountsListState {
    const { fromQuery, toQuery } = useUrlSyncedState(DISCOUNTS_URL_DEFAULTS);
    const urlState: DiscountsUrlState = { ...DISCOUNTS_URL_DEFAULTS };
    const page = ref(1);
    fromQuery(urlState, page);
    const initial = fromDiscountsUrlState(urlState);

    const filters = shallowRef<DiscountsListFilters>(initial.filters);
    const sort = ref<DiscountsSort>(initial.sort);
    const pageSize = ref(initial.pageSize);
    const items = ref<DiscountRegistryItem[]>([]);
    const names = ref(new Map<string, string>());
    const totalItems = ref(0);
    const failed = ref(false);

    const { loading, run } = useLatestRequest(
        async () => {
            try {
                return await fetchDiscountsList(
                    filters.value,
                    page.value,
                    pageSize.value,
                    sort.value,
                );
            } catch (e) {
                console.warn('[discounts] could not load the list:', e);
                return null;
            }
        },
        result => {
            failed.value = result === null;
            items.value = result?.items ?? [];
            names.value = result?.names ?? new Map();
            totalItems.value = result?.totalItems ?? 0;
        },
    );
    const reload = (): void => void run();

    // Chip counts follow the search and the builder; a failure keeps the previous numbers.
    const counts = ref<DiscountsViewCounts | null>(null);
    const { loading: countsLoading, run: runCounts } = useLatestRequest(
        () =>
            fetchDiscountViewCounts(
                filters.value.search,
                conditionsToDiscountsFilter(filters.value.conditions),
            ),
        result => {
            counts.value = result;
        },
    );
    const refreshCounts = (): void => {
        runCounts().catch(e => {
            console.warn('[discounts] could not load view counts:', e);
        });
    };
    const refreshCountsSoon = useDebouncedCallback(refreshCounts, 250);

    watch([filters, sort, pageSize], () => {
        page.value = 1;
    });
    watch([filters, sort, pageSize, page], () => {
        reload();
        toQuery(toDiscountsUrlState(filters.value, sort.value, pageSize.value), page);
    });
    watch(
        () => [filters.value.search, filters.value.conditions],
        () => refreshCountsSoon(),
    );

    onMounted(() => {
        reload();
        refreshCounts();
    });

    return {
        items,
        names,
        totalItems,
        loading,
        failed,
        reload,
        filters,
        sort,
        page,
        pageSize,
        counts,
        countsLoading,
    };
}
