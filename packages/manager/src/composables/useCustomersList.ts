import { onMounted, ref, shallowRef, watch, type Ref } from 'vue';
import { useDebouncedCallback, useLatestRequest } from '@mivend/ui-kit';
import type { FilterOption } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterBuilderTypes';
import {
    fetchCustomersList,
    fetchCustomersViewCounts,
    type CustomersListFilters,
    type CustomersPageResult,
    type CustomersSort,
    type CustomersViewCounts,
} from '../api/customersList';
import { fetchManagerLookup, formatManagerName } from '../api/counterpartyPortalAccess';
import { fetchBranchOptions, fetchManagerOptions } from '../api/orders';
import type { BranchOption, ManagerOption } from '../api/orders';
import type { CounterpartyFilterParameter } from '../api/generated/graphql';
import { useUrlSyncedState } from './useUrlSyncedState';
import {
    CUSTOMERS_URL_DEFAULTS,
    fromCustomersUrlState,
    toCustomersUrlState,
    type CustomersUrlState,
} from './customersListUrl';

export interface CustomersListState {
    result: Ref<CustomersPageResult | null>;
    totalItems: Ref<number>;
    loading: Ref<boolean>;
    failed: Ref<boolean>;
    reload: () => void;
    filters: Ref<CustomersListFilters>;
    sort: Ref<CustomersSort>;
    page: Ref<number>;
    pageSize: Ref<number>;
    counts: Ref<CustomersViewCounts | null>;
    countsLoading: Ref<boolean>;
    branches: Ref<BranchOption[]>;
    managers: Ref<ManagerOption[]>;
    managerOptions: Ref<FilterOption[]>;
    branchOptions: Ref<FilterOption[]>;
}

// Search, view, builder conditions, sort, page and page size live in the URL, so a filtered list is a link.
// `fixedFilter` narrows the scope beside them (a nested list) and is never in the URL; urlPrefix namespaces the keys.
export function useCustomersList(
    fixedFilter: () => CounterpartyFilterParameter | undefined,
    withManagerFilter: boolean,
    urlPrefix = '',
): CustomersListState {
    const { fromQuery, toQuery } = useUrlSyncedState(CUSTOMERS_URL_DEFAULTS, urlPrefix);
    const urlState: CustomersUrlState = { ...CUSTOMERS_URL_DEFAULTS };
    const page = ref(1);
    fromQuery(urlState, page);
    const initial = fromCustomersUrlState(urlState);

    const filters = shallowRef<CustomersListFilters>(initial.filters);
    const sort = ref<CustomersSort>(initial.sort);
    const pageSize = ref(initial.pageSize);
    const result = ref<CustomersPageResult | null>(null);
    const totalItems = ref(0);
    const failed = ref(false);

    const { loading, run } = useLatestRequest(
        async () => {
            try {
                return await fetchCustomersList(
                    filters.value,
                    fixedFilter(),
                    page.value,
                    pageSize.value,
                    sort.value,
                );
            } catch (e) {
                console.warn('[customers] could not load the list:', e);
                return null;
            }
        },
        r => {
            failed.value = r === null;
            result.value = r;
            totalItems.value = r?.totalItems ?? 0;
        },
    );
    const reload = (): void => void run();

    // Chip counts follow the search and the builder; a failure keeps the previous numbers.
    const counts = ref<CustomersViewCounts | null>(null);
    const { loading: countsLoading, run: runCounts } = useLatestRequest(
        () => fetchCustomersViewCounts(filters.value, fixedFilter()),
        r => {
            counts.value = r;
        },
    );
    const refreshCounts = (): void => {
        runCounts().catch(e => {
            console.warn('[customers] could not load view counts:', e);
        });
    };
    const refreshCountsSoon = useDebouncedCallback(refreshCounts, 250);

    watch([filters, sort, pageSize, fixedFilter], () => {
        page.value = 1;
    });
    watch([filters, sort, pageSize, page, fixedFilter], () => {
        reload();
        toQuery(toCustomersUrlState(filters.value, sort.value, pageSize.value), page);
    });
    watch(
        () => [filters.value.search, filters.value.conditions, fixedFilter()],
        () => refreshCountsSoon(),
    );

    // Names are display only: a failed lookup leaves the raw ids and empty choices.
    const branches = ref<BranchOption[]>([]);
    const managers = ref<ManagerOption[]>([]);
    const managerOptions = ref<FilterOption[]>([]);
    const branchOptions = ref<FilterOption[]>([]);
    onMounted(() => {
        reload();
        refreshCounts();
        fetchBranchOptions()
            .then(list => {
                branches.value = list;
                branchOptions.value = list.map(b => ({ value: b.id, label: b.name }));
            })
            .catch(e => console.warn('[customers] could not load branches:', e));
        fetchManagerOptions()
            .then(list => {
                managers.value = list;
            })
            .catch(e => console.warn('[customers] could not load managers:', e));
        if (withManagerFilter) {
            fetchManagerLookup()
                .then(lookup => {
                    const byErpId = new Map<string, string>();
                    for (const u of lookup.erpUsers)
                        byErpId.set(u.erpId, formatManagerName(u.erpId, lookup));
                    for (const a of lookup.administrators)
                        if (a.erpId) byErpId.set(a.erpId, a.name);
                    managerOptions.value = [...byErpId]
                        .map(([value, label]) => ({ value, label }))
                        .sort((a, b) => a.label.localeCompare(b.label));
                })
                .catch(e => console.warn('[customers] could not load manager choices:', e));
        }
    });

    return {
        result,
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
        branches,
        managers,
        managerOptions,
        branchOptions,
    };
}
