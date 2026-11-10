import { onMounted, ref, shallowRef, watch, type Ref } from 'vue';
import { useDebouncedCallback, useLatestRequest } from '@mivend/ui-kit';
import {
    fetchProformaInvoicesList,
    type ProformaInvoicesListFilters,
    type ProformaInvoicesSort,
} from '../api/proformaInvoicesList';
import {
    fetchProformaInvoiceViewCounts,
    type ProformaInvoiceListItem,
    type ProformaInvoiceViewCounts,
} from '../api/proforma-invoices';
import { conditionsToProformaInvoicesFilter } from '../api/proformaInvoicesFilter';
import { useUrlSyncedState } from './useUrlSyncedState';
import {
    PROFORMA_INVOICES_URL_DEFAULTS,
    fromProformaInvoicesUrlState,
    toProformaInvoicesUrlState,
    type ProformaInvoicesUrlState,
} from './proformaInvoicesListUrl';

export interface ProformaInvoicesListState {
    items: Ref<ProformaInvoiceListItem[]>;
    totalItems: Ref<number>;
    loading: Ref<boolean>;
    failed: Ref<boolean>;
    reload: () => void;
    filters: Ref<ProformaInvoicesListFilters>;
    sort: Ref<ProformaInvoicesSort>;
    counterpartyId: Ref<string>;
    page: Ref<number>;
    pageSize: Ref<number>;
    counts: Ref<ProformaInvoiceViewCounts | null>;
    countsLoading: Ref<boolean>;
}

// Search, status, customer, page and page size live in the URL, so a filtered list is a shareable link.
// A fixed customer (an embedded list) wins over the URL and is never written to it; urlPrefix namespaces the keys.
export function useProformaInvoicesList(
    fixedCounterpartyId = '',
    urlPrefix = '',
): ProformaInvoicesListState {
    const { fromQuery, toQuery } = useUrlSyncedState(PROFORMA_INVOICES_URL_DEFAULTS, urlPrefix);
    const urlState: ProformaInvoicesUrlState = { ...PROFORMA_INVOICES_URL_DEFAULTS };
    const page = ref(1);
    fromQuery(urlState, page);
    const initial = fromProformaInvoicesUrlState(urlState);

    const filters = shallowRef<ProformaInvoicesListFilters>(initial.filters);
    const sort = ref<ProformaInvoicesSort>(initial.sort);
    const counterpartyId = ref(fixedCounterpartyId || initial.counterpartyId);
    const pageSize = ref(initial.pageSize);
    const items = ref<ProformaInvoiceListItem[]>([]);
    const totalItems = ref(0);
    const failed = ref(false);

    const { loading, run } = useLatestRequest(
        async () => {
            try {
                return await fetchProformaInvoicesList(
                    filters.value,
                    counterpartyId.value,
                    page.value,
                    pageSize.value,
                    sort.value,
                );
            } catch (e) {
                console.warn('[proforma-invoices] could not load the list:', e);
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
    const counts = ref<ProformaInvoiceViewCounts | null>(null);
    const { loading: countsLoading, run: runCounts } = useLatestRequest(
        () =>
            fetchProformaInvoiceViewCounts(
                counterpartyId.value,
                filters.value.search,
                conditionsToProformaInvoicesFilter(filters.value.conditions),
            ),
        result => {
            counts.value = result;
        },
    );
    const refreshCounts = (): void => {
        runCounts().catch(e => {
            console.warn('[proforma-invoices] could not load view counts:', e);
        });
    };
    const refreshCountsSoon = useDebouncedCallback(refreshCounts, 250);

    watch([filters, sort, counterpartyId, pageSize], () => {
        page.value = 1;
    });
    watch([filters, sort, counterpartyId, pageSize, page], () => {
        reload();
        toQuery(
            toProformaInvoicesUrlState(
                filters.value,
                fixedCounterpartyId ? '' : counterpartyId.value,
                sort.value,
                pageSize.value,
            ),
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
