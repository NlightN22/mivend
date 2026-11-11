import { onMounted, ref, shallowRef, watch, type Ref } from 'vue';
import { useDebouncedCallback, useLatestRequest } from '@mivend/ui-kit';
import type { FilterOption } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterBuilderTypes';
import {
    fetchSettlementsList,
    type SettlementsListFilters,
    type SettlementsSort,
} from '../api/settlementsList';
import {
    fetchSettlementTypeCounts,
    type SettlementListItem,
    type SettlementTypeCount,
} from '../api/settlements';
import { fetchOrganizations } from '../api/organizations';
import { conditionsToSettlementsFilter } from '../api/settlementsFilter';
import { useUrlSyncedState } from './useUrlSyncedState';
import {
    SETTLEMENTS_URL_DEFAULTS,
    fromSettlementsUrlState,
    toSettlementsUrlState,
    type SettlementsUrlState,
} from './settlementsListUrl';

export interface SettlementsListState {
    items: Ref<SettlementListItem[]>;
    totalItems: Ref<number>;
    loading: Ref<boolean>;
    failed: Ref<boolean>;
    reload: () => void;
    filters: Ref<SettlementsListFilters>;
    sort: Ref<SettlementsSort>;
    counterpartyId: Ref<string>;
    page: Ref<number>;
    pageSize: Ref<number>;
    counts: Ref<SettlementTypeCount[] | null>;
    countsLoading: Ref<boolean>;
    typeOptions: Ref<FilterOption[]>;
    organizationOptions: Ref<FilterOption[]>;
}

// Search, type, customer, page and page size live in the URL, so a filtered list is a shareable link.
// A fixed customer (an embedded list) wins over the URL and is never written to it; urlPrefix namespaces the keys.
export function useSettlementsList(fixedCounterpartyId = '', urlPrefix = ''): SettlementsListState {
    const { fromQuery, toQuery } = useUrlSyncedState(SETTLEMENTS_URL_DEFAULTS, urlPrefix);
    const urlState: SettlementsUrlState = { ...SETTLEMENTS_URL_DEFAULTS };
    const page = ref(1);
    fromQuery(urlState, page);
    const initial = fromSettlementsUrlState(urlState);

    const filters = shallowRef<SettlementsListFilters>(initial.filters);
    const sort = ref<SettlementsSort>(initial.sort);
    const counterpartyId = ref(fixedCounterpartyId || initial.counterpartyId);
    const pageSize = ref(initial.pageSize);
    const items = ref<SettlementListItem[]>([]);
    const totalItems = ref(0);
    const failed = ref(false);

    const { loading, run } = useLatestRequest(
        async () => {
            try {
                return await fetchSettlementsList(
                    filters.value,
                    counterpartyId.value,
                    page.value,
                    pageSize.value,
                    sort.value,
                );
            } catch (e) {
                console.warn('[settlements] could not load the list:', e);
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

    // Chip counts follow the search and the filter; a failure keeps the previous numbers.
    const counts = ref<SettlementTypeCount[] | null>(null);
    const { loading: countsLoading, run: runCounts } = useLatestRequest(
        () =>
            fetchSettlementTypeCounts(
                counterpartyId.value,
                filters.value.search,
                conditionsToSettlementsFilter(filters.value.conditions),
            ),
        result => {
            counts.value = result;
        },
    );
    const refreshCounts = (): void => {
        runCounts().catch(e => {
            console.warn('[settlements] could not load type counts:', e);
        });
    };
    const refreshCountsSoon = useDebouncedCallback(refreshCounts, 250);

    // The Filter builder's Type choices: every type of the customer scope, unaffected by search and filters.
    const typeOptions = ref<FilterOption[]>([]);
    const { run: runTypeOptions } = useLatestRequest(
        () => fetchSettlementTypeCounts(counterpartyId.value),
        result => {
            typeOptions.value = result
                .map(c => ({ value: c.label, label: c.label }))
                .sort((a, b) => a.label.localeCompare(b.label));
        },
    );
    const refreshTypeOptions = (): void => {
        runTypeOptions().catch(e => {
            console.warn('[settlements] could not load document types:', e);
        });
    };
    watch(counterpartyId, refreshTypeOptions);

    const organizationOptions = ref<FilterOption[]>([]);
    const refreshOrganizationOptions = (): void => {
        fetchOrganizations()
            .then(orgs => {
                organizationOptions.value = orgs
                    .map(o => ({ value: o.legalName, label: o.legalName }))
                    .sort((a, b) => a.label.localeCompare(b.label));
            })
            .catch(e => {
                console.warn('[settlements] could not load organizations:', e);
            });
    };

    watch([filters, sort, counterpartyId, pageSize], () => {
        page.value = 1;
    });
    watch([filters, sort, counterpartyId, pageSize, page], () => {
        reload();
        toQuery(
            toSettlementsUrlState(
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
        refreshTypeOptions();
        refreshOrganizationOptions();
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
        typeOptions,
        organizationOptions,
    };
}
