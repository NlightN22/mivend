import { onMounted, ref, shallowRef, watch, type Ref } from 'vue';
import { useLatestRequest } from '@mivend/ui-kit';
import { useUrlSyncedState } from './useUrlSyncedState';
import {
    fetchBulkBatches,
    fetchBulkCatalog,
    type BulkBatch,
    type BulkOperationInfo,
} from '../api/bulkOperations';
import {
    BLANK_HISTORY_FILTERS,
    HISTORY_SORT_FIELDS,
    HISTORY_VIEWS,
    conditionsFromUrl,
    conditionsToUrl,
    toBatchFilter,
    type BulkHistoryFilters,
} from '../api/bulkHistoryFilter';

export interface HistorySort {
    field: string;
    dir: 'ASC' | 'DESC';
}

const URL_DEFAULTS = {
    search: '',
    view: 'all',
    filters: '',
    sortField: 'createdAt',
    sortDir: 'DESC',
    pageSize: '10',
};

export interface BulkHistoryState {
    items: Ref<BulkBatch[]>;
    totalItems: Ref<number>;
    loading: Ref<boolean>;
    failed: Ref<boolean>;
    filters: Ref<BulkHistoryFilters>;
    sort: Ref<HistorySort>;
    page: Ref<number>;
    pageSize: Ref<number>;
    operations: Ref<BulkOperationInfo[]>;
    viewCounts: Ref<Record<string, number> | null>;
    reload: () => void;
}

// Filters, sort, page and page size live in the URL, so a filtered history is a shareable link.
export function useBulkHistory(): BulkHistoryState {
    const { fromQuery, toQuery } = useUrlSyncedState(URL_DEFAULTS);
    const url = { ...URL_DEFAULTS };
    const page = ref(1);
    fromQuery(url, page);

    const filters = shallowRef<BulkHistoryFilters>({
        search: url.search,
        view: HISTORY_VIEWS.some(v => v.key === url.view) ? url.view : 'all',
        conditions: conditionsFromUrl(url.filters),
    });
    const sort = ref<HistorySort>({
        field: HISTORY_SORT_FIELDS.includes(url.sortField) ? url.sortField : 'createdAt',
        dir: url.sortDir === 'ASC' ? 'ASC' : 'DESC',
    });
    const pageSize = ref(Number(url.pageSize) > 0 ? Number(url.pageSize) : 10);
    const items = ref<BulkBatch[]>([]);
    const totalItems = ref(0);
    const failed = ref(false);
    const operations = ref<BulkOperationInfo[]>([]);
    const viewCounts = ref<Record<string, number> | null>(null);

    const { loading, run } = useLatestRequest(
        async () => {
            try {
                return await fetchBulkBatches({
                    filter: toBatchFilter(filters.value),
                    sort: { field: sort.value.field, direction: sort.value.dir },
                    take: pageSize.value,
                    skip: (page.value - 1) * pageSize.value,
                });
            } catch (e) {
                console.warn('[bulk history] could not load the list:', e);
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

    // Each chip counts what clicking it would show, under the other active filters.
    async function loadCounts(): Promise<void> {
        const base = { ...filters.value, view: 'all' };
        try {
            const counts = await Promise.all(
                HISTORY_VIEWS.map(v =>
                    fetchBulkBatches({ take: 1, filter: toBatchFilter({ ...base, view: v.key }) }),
                ),
            );
            viewCounts.value = Object.fromEntries(
                HISTORY_VIEWS.map((v, i) => [v.key, counts[i].totalItems]),
            );
        } catch {
            viewCounts.value = null;
        }
    }

    watch([filters, sort, pageSize], () => {
        page.value = 1;
    });
    watch([filters, sort, pageSize, page], () => {
        reload();
        toQuery(
            {
                search: filters.value.search,
                view: filters.value.view,
                filters: conditionsToUrl(filters.value.conditions),
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

    onMounted(() => {
        reload();
        void loadCounts();
        void fetchBulkCatalog()
            .then(list => (operations.value = list))
            .catch(() => undefined);
    });

    return {
        items,
        totalItems,
        loading,
        failed,
        filters,
        sort,
        page,
        pageSize,
        operations,
        viewCounts,
        reload,
    };
}

export { BLANK_HISTORY_FILTERS };
