import { onMounted, ref, shallowRef, watch, type Ref } from 'vue';
import { useLatestRequest } from '@mivend/ui-kit';
import {
    conditionsFromQuery,
    conditionsToQuery,
    type FilterColumn,
    type FilterCondition,
} from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import type { Page } from '../api/exchangeHealth';
import type { ListRequest } from '../api/exchangeListFilters';
import { useUrlSyncedState } from './useUrlSyncedState';

export interface ExchangeListSource {
    views: string[];
    sortFields: string[];
    defaultSort: { field: string; dir: 'ASC' | 'DESC' };
    filterColumns: FilterColumn[];
    fetch: (request: ListRequest) => Promise<Page<{ id: string }>>;
}

export interface ExchangeListFilters {
    search: string;
    view: string;
    conditions: FilterCondition[];
}

export const BLANK_FILTERS: ExchangeListFilters = { search: '', view: 'all', conditions: [] };

const URL_DEFAULTS = {
    search: '',
    view: 'all',
    filters: '',
    sortField: '',
    sortDir: 'DESC',
    pageSize: '20',
};

export interface ExchangeListState {
    items: Ref<Array<{ id: string }>>;
    totalItems: Ref<number>;
    totalItemsCapped: Ref<boolean>;
    viewCapped: Ref<Record<string, boolean>>;
    loading: Ref<boolean>;
    failed: Ref<boolean>;
    filters: Ref<ExchangeListFilters>;
    sort: Ref<{ field: string; dir: 'ASC' | 'DESC' }>;
    page: Ref<number>;
    pageSize: Ref<number>;
    viewCounts: Ref<Record<string, number> | null>;
    reload: () => void;
}

// Filters, sort, page and page size live in the URL, so a filtered list is a shareable link.
export function useExchangeList(source: ExchangeListSource): ExchangeListState {
    const { fromQuery, toQuery } = useUrlSyncedState(URL_DEFAULTS);
    const url = { ...URL_DEFAULTS, sortField: source.defaultSort.field };
    const page = ref(1);
    fromQuery(url, page);

    const filters = shallowRef<ExchangeListFilters>({
        search: url.search,
        view: source.views.includes(url.view) ? url.view : 'all',
        conditions: conditionsFromQuery(url.filters, source.filterColumns),
    });
    const sort = ref({
        field: source.sortFields.includes(url.sortField) ? url.sortField : source.defaultSort.field,
        dir: url.sortDir === 'ASC' ? ('ASC' as const) : ('DESC' as const),
    });
    const pageSize = ref(Number(url.pageSize) > 0 ? Number(url.pageSize) : 20);
    const items = ref<Array<{ id: string }>>([]);
    const totalItems = ref(0);
    const totalItemsCapped = ref(false);
    const viewCapped = ref<Record<string, boolean>>({});
    const failed = ref(false);
    const viewCounts = ref<Record<string, number> | null>(null);

    const request = (view: string, skip: number, take: number): ListRequest => ({
        conditions: filters.value.conditions,
        view,
        search: filters.value.search,
        sort: sort.value,
        skip,
        take,
    });

    const { loading, run } = useLatestRequest(
        async () => {
            try {
                const skip = (page.value - 1) * pageSize.value;
                return await source.fetch(request(filters.value.view, skip, pageSize.value));
            } catch (e) {
                console.warn('[exchange health] could not load the list:', e);
                return null;
            }
        },
        result => {
            failed.value = result === null;
            items.value = result?.items ?? [];
            totalItems.value = result?.totalItems ?? 0;
            totalItemsCapped.value = result?.totalItemsCapped ?? false;
        },
    );
    const reload = (): void => void run();

    async function loadCounts(): Promise<void> {
        if (source.views.length < 2) return;
        try {
            const counts = await Promise.all(source.views.map(v => source.fetch(request(v, 0, 1))));
            viewCounts.value = Object.fromEntries(
                source.views.map((v, i) => [v, counts[i].totalItems]),
            );
            viewCapped.value = Object.fromEntries(
                source.views.map((v, i) => [v, counts[i].totalItemsCapped ?? false]),
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
                filters: conditionsToQuery(filters.value.conditions),
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
    });

    return {
        items,
        totalItems,
        totalItemsCapped,
        viewCapped,
        loading,
        failed,
        filters,
        sort,
        page,
        pageSize,
        viewCounts,
        reload,
    };
}
