import { computed, onMounted, ref, shallowRef, watch, type Ref } from 'vue';
import { useLatestRequest } from '@mivend/ui-kit';
import { i18n } from '../i18n';
import { useUrlSyncedState } from './useUrlSyncedState';
import { fetchBranchOptions, type BranchOption } from '../api/orders';
import {
    fetchActivationCandidates,
    fetchManagerLookup,
    formatManagerName,
    type ActivationCandidate,
    type ManagerLookup,
} from '../api/counterpartyPortalAccess';
import { fetchReadinessCounts, type ReadinessCounts } from '../api/counterpartyActivationCounts';
import {
    ACTIVATION_VIEWS,
    activationConditionsFromUrl,
    activationConditionsToUrl,
    conditionsToCounterpartyFilter,
    readinessOfView,
    type ActivationFilters,
} from '../api/activationFilter';
import {
    ACTIVATION_SORT_FIELDS,
    DEFAULT_ACTIVATION_SORT,
    sortParameter,
    type ActivationSort,
} from '../components/bulk-operations/counterpartySort';

const URL_DEFAULTS = {
    search: '',
    view: 'all',
    filters: '',
    sortField: DEFAULT_ACTIVATION_SORT.field as string,
    sortDir: DEFAULT_ACTIVATION_SORT.dir as string,
    pageSize: '20',
};

export interface ActivationCandidatesState {
    items: Ref<ActivationCandidate[]>;
    totalItems: Ref<number>;
    loading: Ref<boolean>;
    failed: Ref<boolean>;
    page: Ref<number>;
    pageSize: Ref<number>;
    filters: Ref<ActivationFilters>;
    sort: Ref<ActivationSort>;
    readinessCounts: Ref<ReadinessCounts | null>;
    branches: Ref<BranchOption[]>;
    managerName: (managerErpId: string | null) => string;
    managerOptions: Ref<Array<{ value: string; label: string }>>;
    branchName: (branchId: string | null) => string;
    reload: () => void;
}

// The select step's list: server-paginated, filters, sort, page and page size live in the URL.
export function useActivationCandidates(): ActivationCandidatesState {
    const { fromQuery, toQuery } = useUrlSyncedState(URL_DEFAULTS);
    const url = { ...URL_DEFAULTS };
    const page = ref(1);
    fromQuery(url, page);

    const filters = shallowRef<ActivationFilters>({
        search: url.search,
        view: ACTIVATION_VIEWS.some(v => v.key === url.view) ? url.view : 'all',
        conditions: activationConditionsFromUrl(url.filters),
    });
    const sortField = ACTIVATION_SORT_FIELDS.find(f => f === url.sortField);
    const sort = ref<ActivationSort>({
        field: sortField ?? DEFAULT_ACTIVATION_SORT.field,
        dir: url.sortDir === 'DESC' ? 'DESC' : 'ASC',
    });
    const pageSize = ref(Number(url.pageSize) > 0 ? Number(url.pageSize) : 20);
    const items = ref<ActivationCandidate[]>([]);
    const totalItems = ref(0);
    const failed = ref(false);
    const readinessCounts = ref<ReadinessCounts | null>(null);
    const managerLookup = ref<ManagerLookup>({ administrators: [], erpUsers: [] });
    const branches = ref<BranchOption[]>([]);

    const { loading, run } = useLatestRequest(
        async () => {
            try {
                return await fetchActivationCandidates({
                    search: filters.value.search,
                    readiness: readinessOfView(filters.value.view),
                    filter: conditionsToCounterpartyFilter(filters.value.conditions),
                    take: pageSize.value,
                    skip: (page.value - 1) * pageSize.value,
                    sort: sortParameter(sort.value),
                });
            } catch (e) {
                console.warn('[activation select] could not load the list:', e);
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

    const { run: loadCounts } = useLatestRequest(
        async () => {
            try {
                return await fetchReadinessCounts({
                    search: filters.value.search,
                    filter: conditionsToCounterpartyFilter(filters.value.conditions),
                });
            } catch {
                return null;
            }
        },
        result => {
            readinessCounts.value = result;
        },
    );

    watch([filters, sort, pageSize], () => {
        page.value = 1;
    });
    watch([filters, sort, pageSize, page], () => {
        reload();
        toQuery(
            {
                search: filters.value.search,
                view: filters.value.view,
                filters: activationConditionsToUrl(filters.value.conditions),
                sortField: sort.value.field,
                sortDir: sort.value.dir,
                pageSize: String(pageSize.value),
            },
            page,
        );
    });
    watch(
        () => [filters.value.search, filters.value.conditions],
        () => void loadCounts(),
    );

    // Manager and branch names are display only: a failed lookup falls back to raw ids.
    onMounted(() => {
        reload();
        void loadCounts();
        void Promise.all([fetchManagerLookup(), fetchBranchOptions()])
            .then(([lookup, options]) => {
                managerLookup.value = lookup;
                branches.value = options;
            })
            .catch(() => undefined);
    });

    const managerOptions = computed(() => {
        const byErpId = new Map<string, string>();
        for (const u of managerLookup.value.erpUsers) byErpId.set(u.erpId, u.fullName ?? u.erpId);
        for (const a of managerLookup.value.administrators) {
            if (a.erpId) byErpId.set(a.erpId, a.name);
        }
        return [...byErpId]
            .map(([value, label]) => ({ value, label }))
            .sort((a, b) => a.label.localeCompare(b.label));
    });

    return {
        items,
        totalItems,
        loading,
        failed,
        page,
        pageSize,
        filters,
        sort,
        readinessCounts,
        branches,
        managerOptions,
        managerName: id => formatManagerName(id, managerLookup.value),
        branchName: id => (id ? (branches.value.find(b => b.id === id)?.name ?? id) : i18n.global.t('bulkOperations.activation.unassigned')),
        reload,
    };
}
