import { ref, watch, type Ref } from 'vue';
import { useLatestRequest } from '@mivend/ui-kit';
import { useUrlSyncedState } from './useUrlSyncedState';
import { fetchBranchOptions, type BranchOption } from '../api/orders';
import {
    fetchActivationCandidates,
    fetchManagerLookup,
    formatManagerName,
    type ActivationCandidate,
    type ActivationFilterOptions,
    type CounterpartySortParameter,
    type ManagerLookup,
} from '../api/counterpartyPortalAccess';
import { fetchReadinessCounts, type ReadinessCounts } from '../api/counterpartyActivationCounts';
import { UNASSIGNED_BRANCH } from '../components/bulk-operations/activationColumns';
import type { ActivationFilters } from '../components/bulk-operations/CounterpartyActivationDataTable.vue';

interface UrlFilters {
    [key: string]: string;
    status: string;
    search: string;
    manager: string;
    branch: string;
    readiness: string;
    pageSize: string;
}

const URL_DEFAULTS: UrlFilters = {
    status: '',
    search: '',
    manager: '',
    branch: '',
    readiness: '',
    pageSize: '20',
};

export interface ActivationCandidatesState {
    items: Ref<ActivationCandidate[]>;
    totalItems: Ref<number>;
    loading: Ref<boolean>;
    error: Ref<string>;
    page: Ref<number>;
    pageSize: Ref<number>;
    filters: Ref<ActivationFilters>;
    statusFilter: Ref<'active' | 'inactive' | ''>;
    sort: Ref<CounterpartySortParameter>;
    readinessCounts: Ref<ReadinessCounts>;
    branches: Ref<BranchOption[]>;
    managerName: (managerErpId: string | null) => string;
    branchName: (branchId: string | null) => string;
}

// The select step's list: server-paginated, filters, sort, page and page size live in the URL.
export function useActivationCandidates(): ActivationCandidatesState {
    const page = ref(1);
    const pageSize = ref(20);
    const totalItems = ref(0);
    const items = ref<ActivationCandidate[]>([]);
    const filters = ref<ActivationFilters>({
        shortName: '',
        manager: '',
        branch: '',
        readiness: '',
    });
    const statusFilter = ref<'active' | 'inactive' | ''>('');
    const sort = ref<CounterpartySortParameter>({ shortName: 'ASC' });
    const error = ref('');
    const readinessCounts = ref<ReadinessCounts>({
        all: 0,
        ready: 0,
        'missing-data': 0,
        'erp-inactive': 0,
        activated: 0,
    });
    const managerLookup = ref<ManagerLookup>({ administrators: [], erpUsers: [] });
    const branches = ref<BranchOption[]>([]);

    const { fromQuery, toQuery } = useUrlSyncedState(URL_DEFAULTS);
    const parsed = { ...URL_DEFAULTS };
    fromQuery(parsed, page);
    if (parsed.status) statusFilter.value = parsed.status as 'active' | 'inactive';
    filters.value = {
        shortName: parsed.search,
        manager: parsed.manager,
        branch: parsed.branch,
        readiness: parsed.readiness,
    };
    if (Number(parsed.pageSize) > 0) pageSize.value = Number(parsed.pageSize);

    function filterOptions(): Omit<ActivationFilterOptions, 'readiness'> {
        return {
            search: filters.value.shortName || undefined,
            status: statusFilter.value || undefined,
            managerErpId: filters.value.manager || undefined,
            branchId: filters.value.branch || undefined,
            branchUnassigned: filters.value.branch === UNASSIGNED_BRANCH,
        };
    }

    const { loading, run: loadCandidates } = useLatestRequest(
        () =>
            fetchActivationCandidates({
                ...filterOptions(),
                readiness: filters.value.readiness || undefined,
                take: pageSize.value,
                skip: (page.value - 1) * pageSize.value,
                sort: sort.value,
            }),
        result => {
            items.value = result.items;
            totalItems.value = result.totalItems;
        },
    );
    const { run: loadCounts } = useLatestRequest(
        () => fetchReadinessCounts(filterOptions()),
        result => {
            readinessCounts.value = result;
        },
    );

    async function load(): Promise<void> {
        error.value = '';
        try {
            await Promise.all([loadCandidates(), loadCounts()]);
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Could not load counterparties';
        }
    }

    // Manager and branch names are display only: a failed lookup falls back to raw ids.
    void Promise.all([fetchManagerLookup(), fetchBranchOptions()])
        .then(([lookup, options]) => {
            managerLookup.value = lookup;
            branches.value = options;
        })
        .catch(() => undefined);
    void load();

    watch([statusFilter, filters, pageSize], () => {
        page.value = 1;
    });
    watch([page, statusFilter, filters, pageSize, sort], () => {
        void load();
        toQuery(
            {
                status: statusFilter.value,
                search: filters.value.shortName,
                manager: filters.value.manager,
                branch: filters.value.branch,
                readiness: filters.value.readiness,
                pageSize: String(pageSize.value),
            },
            page,
        );
    });

    return {
        items,
        totalItems,
        loading,
        error,
        page,
        pageSize,
        filters,
        statusFilter,
        sort,
        readinessCounts,
        branches,
        managerName: id => formatManagerName(id, managerLookup.value),
        branchName: id => (id ? (branches.value.find(b => b.id === id)?.name ?? id) : 'Unassigned'),
    };
}
