import { ref, shallowRef, watch, type Ref, type ShallowRef } from 'vue';
import {
    conditionsFromQuery,
    conditionsToQuery,
    type FilterColumn,
    type FilterCondition,
} from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import { useUrlSyncedState } from './useUrlSyncedState';

export interface CardTabSort {
    field: string;
    dir: 'ASC' | 'DESC';
}

export interface CardTabListState {
    search: Ref<string>;
    conditions: ShallowRef<FilterCondition[]>;
    sort: Ref<CardTabSort>;
    page: Ref<number>;
    pageSize: Ref<number>;
}

export interface CardTabListOptions {
    urlPrefix: string;
    filterColumns: FilterColumn[];
    sortFields: string[];
    defaultSort: CardTabSort;
    onChange: () => void;
}

const URL_KEYS = ['search', 'filters', 'sortField', 'sortDir', 'pageSize', 'page'];

export function cardTabOpenedWithLink(urlPrefix: string, query: Record<string, unknown>): boolean {
    return URL_KEYS.some(k => `${urlPrefix}${k}` in query);
}

// Search, filters, sort, page and page size of a customer card tab live in the URL under the tab's prefix.
export function useCardTabList(options: CardTabListOptions): CardTabListState {
    const { urlPrefix, filterColumns, sortFields, defaultSort, onChange } = options;
    const defaults: Record<string, string> = {
        search: '',
        filters: '',
        sortField: defaultSort.field,
        sortDir: defaultSort.dir,
        pageSize: '10',
    };
    const { fromQuery, toQuery } = useUrlSyncedState(defaults, urlPrefix);
    const url = { ...defaults };
    const page = ref(1);
    fromQuery(url, page);

    const search = ref(url.search);
    const conditions = shallowRef(conditionsFromQuery(url.filters, filterColumns));
    const sort = ref<CardTabSort>({
        field: sortFields.includes(url.sortField) ? url.sortField : defaultSort.field,
        dir: url.sortDir === 'ASC' ? 'ASC' : 'DESC',
    });
    const pageSize = ref(Number(url.pageSize) > 0 ? Number(url.pageSize) : 10);

    watch([search, conditions, sort, pageSize], () => {
        page.value = 1;
    });
    watch([search, conditions, sort, pageSize, page], () => {
        onChange();
        toQuery(
            {
                search: search.value,
                filters: conditionsToQuery(conditions.value),
                sortField: sort.value.field,
                sortDir: sort.value.dir,
                pageSize: String(pageSize.value),
            },
            page,
        );
    });

    return { search, conditions, sort, page, pageSize };
}
