import { onMounted, ref, shallowRef, watch, type Ref } from 'vue';
import { useDebouncedCallback, useLatestRequest } from '@mivend/ui-kit';
import {
    fetchPaymentsList,
    type PaymentsListFilters,
    type PaymentsSort,
} from '../api/paymentsList';
import {
    fetchPaymentViewCounts,
    type PaymentListItem,
    type PaymentViewCounts,
} from '../api/payments';
import { conditionsToPaymentsFilter } from '../api/paymentsFilter';
import { useUrlSyncedState } from './useUrlSyncedState';
import {
    PAYMENTS_URL_DEFAULTS,
    fromPaymentsUrlState,
    toPaymentsUrlState,
    type PaymentsUrlState,
} from './paymentsListUrl';

export interface PaymentsListState {
    items: Ref<PaymentListItem[]>;
    totalItems: Ref<number>;
    loading: Ref<boolean>;
    failed: Ref<boolean>;
    reload: () => void;
    filters: Ref<PaymentsListFilters>;
    sort: Ref<PaymentsSort>;
    counterpartyId: Ref<string>;
    page: Ref<number>;
    pageSize: Ref<number>;
    counts: Ref<PaymentViewCounts | null>;
    countsLoading: Ref<boolean>;
}

// Search, status, customer, page and page size live in the URL, so a filtered list is a shareable link.
export function usePaymentsList(): PaymentsListState {
    const { fromQuery, toQuery } = useUrlSyncedState(PAYMENTS_URL_DEFAULTS);
    const urlState: PaymentsUrlState = { ...PAYMENTS_URL_DEFAULTS };
    const page = ref(1);
    fromQuery(urlState, page);
    const initial = fromPaymentsUrlState(urlState);

    const filters = shallowRef<PaymentsListFilters>(initial.filters);
    const sort = ref<PaymentsSort>(initial.sort);
    const counterpartyId = ref(initial.counterpartyId);
    const pageSize = ref(initial.pageSize);
    const items = ref<PaymentListItem[]>([]);
    const totalItems = ref(0);
    const failed = ref(false);

    const { loading, run } = useLatestRequest(
        async () => {
            try {
                return await fetchPaymentsList(
                    filters.value,
                    counterpartyId.value,
                    page.value,
                    pageSize.value,
                    sort.value,
                );
            } catch (e) {
                console.warn('[payments] could not load the list:', e);
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

    // Chip counts follow the search; a failure keeps the previous numbers.
    const counts = ref<PaymentViewCounts | null>(null);
    const { loading: countsLoading, run: runCounts } = useLatestRequest(
        () =>
            fetchPaymentViewCounts(
                counterpartyId.value,
                filters.value.search,
                conditionsToPaymentsFilter(filters.value.conditions),
            ),
        result => {
            counts.value = result;
        },
    );
    const refreshCounts = (): void => {
        runCounts().catch(e => {
            console.warn('[payments] could not load view counts:', e);
        });
    };
    const refreshCountsSoon = useDebouncedCallback(refreshCounts, 250);

    watch([filters, sort, counterpartyId, pageSize], () => {
        page.value = 1;
    });
    watch([filters, sort, counterpartyId, pageSize, page], () => {
        reload();
        toQuery(
            toPaymentsUrlState(filters.value, counterpartyId.value, sort.value, pageSize.value),
            page,
        );
    });
    watch(
        () => [filters.value.search, filters.value.conditions, counterpartyId.value],
        () => refreshCountsSoon(),
    );

    onMounted(() => {
        reload();
        refreshCounts();
    });

    return {
        items,
        totalItems,
        loading,
        failed,
        reload,
        filters,
        sort,
        counterpartyId,
        page,
        pageSize,
        counts,
        countsLoading,
    };
}
