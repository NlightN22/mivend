import { onMounted, ref, shallowRef, watch, type Ref } from 'vue';
import { useLatestRequest } from '@mivend/ui-kit';
import {
    fetchErpDiscountsCounts,
    fetchErpDiscountsPage,
    type ErpDiscountItem,
    type ErpDiscountsListFilters,
    type ErpDiscountsSort,
    type ErpDiscountsViewCounts,
} from '../api/erpDiscountsList';
import { useUrlSearchParam } from './useUrlSearchParam';
import { useUrlSyncedState } from './useUrlSyncedState';
import {
    ERP_DISCOUNTS_URL_DEFAULTS,
    fromErpDiscountsUrlState,
    toErpDiscountsUrlState,
    type ErpDiscountsUrlState,
} from './erpDiscountsListUrl';

export interface ErpDiscountsListState {
    items: Ref<ErpDiscountItem[]>;
    totalItems: Ref<number>;
    loading: Ref<boolean>;
    failed: Ref<boolean>;
    reload: () => void;
    filters: Ref<ErpDiscountsListFilters>;
    sort: Ref<ErpDiscountsSort>;
    page: Ref<number>;
    pageSize: Ref<number>;
    counts: Ref<ErpDiscountsViewCounts | null>;
    countsLoading: Ref<boolean>;
}

// Search, chip, sort, page and page size live in the URL under urlPrefix; a fixed customer never does.
export function useErpDiscountsList(counterpartyId = '', urlPrefix = ''): ErpDiscountsListState {
    const { fromQuery, toQuery } = useUrlSyncedState(ERP_DISCOUNTS_URL_DEFAULTS, urlPrefix);
    const urlState: ErpDiscountsUrlState = { ...ERP_DISCOUNTS_URL_DEFAULTS };
    const page = ref(1);
    fromQuery(urlState, page);
    const initial = fromErpDiscountsUrlState(urlState);

    const filters = shallowRef<ErpDiscountsListFilters>(initial.filters);
    const sort = ref<ErpDiscountsSort>(initial.sort);
    const pageSize = ref(initial.pageSize);
    const items = ref<ErpDiscountItem[]>([]);
    const totalItems = ref(0);
    const failed = ref(false);

    const { loading, run } = useLatestRequest(
        async () => {
            try {
                return await fetchErpDiscountsPage(
                    filters.value,
                    counterpartyId,
                    page.value,
                    pageSize.value,
                    sort.value,
                );
            } catch (e) {
                console.warn('[erp-discounts] could not load the list:', e);
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

    // A failure keeps the previous numbers.
    const counts = ref<ErpDiscountsViewCounts | null>(null);
    const { loading: countsLoading, run: runCounts } = useLatestRequest(
        () => fetchErpDiscountsCounts(counterpartyId),
        result => {
            counts.value = result;
        },
    );

    useUrlSearchParam(filters, urlPrefix);

    watch([filters, sort, pageSize], () => {
        page.value = 1;
    });
    watch([filters, sort, pageSize, page], () => {
        reload();
        toQuery(toErpDiscountsUrlState(filters.value, sort.value, pageSize.value), page);
    });

    onMounted(() => {
        reload();
        runCounts().catch(e => {
            console.warn('[erp-discounts] could not load view counts:', e);
        });
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
        counts,
        countsLoading,
    };
}
