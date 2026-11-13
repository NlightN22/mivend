import { watch, type Ref } from 'vue';
import { useRoute } from 'vue-router';
import {
    useDataTableState,
    type AdvancedDataTableColumn,
    type DataTableState,
} from '@mivend/ui-kit';
import type { TableViewState } from './tableViewState';
import { cardTabOpenedWithLink, type CardTabListState, type CardTabSort } from './useCardTabList';

interface CardTabFilters {
    [key: string]: unknown;
    search: string;
}

type SortState = { field: string; order: 1 | -1 }[];

export function sortToState(sort: CardTabSort, columns: AdvancedDataTableColumn[]): SortState {
    const column = columns.find(c => c.sortField === sort.field);
    return column ? [{ field: column.field, order: sort.dir === 'ASC' ? 1 : -1 }] : [];
}

export function sortFromState(
    state: SortState,
    columns: AdvancedDataTableColumn[],
    fallback: CardTabSort,
): CardTabSort {
    const first = state[0];
    const column = first && columns.find(c => c.field === first.field);
    if (!first || !column?.sortField) return { ...fallback };
    return { field: column.sortField, dir: first.order === 1 ? 'ASC' : 'DESC' };
}

interface TableOptions {
    storageKey: string;
    columns: AdvancedDataTableColumn[];
    hiddenColumns?: string[];
    list: CardTabListState;
    urlPrefix: string;
    defaultSort: CardTabSort;
}

// Keeps the table's own state and the tab's URL-synced list state in step, and builds the Views capture/apply pair.
export function useCardTabTable(options: TableOptions): {
    tableState: Ref<DataTableState<CardTabFilters>>;
    captureView: () => TableViewState;
    applyView: (state: TableViewState) => void;
    openedWithLink: boolean;
} {
    const { storageKey, columns, list, urlPrefix, defaultSort } = options;
    const { state: tableState } = useDataTableState<CardTabFilters>(
        storageKey,
        {
            columnOrder: columns.map(c => c.field),
            columnWidths: Object.fromEntries(columns.map(c => [c.field, c.width])),
            hiddenColumns: [...(options.hiddenColumns ?? [])],
            sort: sortToState(list.sort.value, columns),
            filters: { search: list.search.value },
            pageSize: list.pageSize.value,
        },
        {
            columns,
            allowedFilterKeys: [],
            externallyOwned: { pageSize: true, filterKeys: ['search'] },
        },
    );
    tableState.value.sort = sortToState(list.sort.value, columns);

    watch(
        () => tableState.value.filters.search,
        search => {
            if (search !== list.search.value) list.search.value = String(search);
        },
    );
    watch(list.search, search => {
        if (search !== tableState.value.filters.search) tableState.value.filters.search = search;
    });
    watch(
        () => tableState.value.sort,
        s => {
            list.sort.value = sortFromState(s, columns, defaultSort);
        },
        { deep: true },
    );
    watch(
        () => tableState.value.pageSize,
        size => {
            list.pageSize.value = size;
        },
    );

    function captureView(): TableViewState {
        return {
            filters: { search: list.search.value, view: 'all', conditions: list.conditions.value },
            sort: { ...list.sort.value },
            columnOrder: [...tableState.value.columnOrder],
            hiddenColumns: [...tableState.value.hiddenColumns],
        };
    }

    function applyView(state: TableViewState): void {
        const fields = columns.map(c => c.field);
        const order = state.columnOrder.filter(f => fields.includes(f));
        tableState.value.columnOrder = [...order, ...fields.filter(f => !order.includes(f))];
        tableState.value.hiddenColumns = state.hiddenColumns.filter(
            f => fields.includes(f) && !columns.find(c => c.field === f)?.required,
        );
        const sort = sortToState(state.sort, columns);
        tableState.value.sort = sort;
        list.sort.value = sortFromState(sort, columns, defaultSort);
        list.search.value = state.filters.search;
        list.conditions.value = state.filters.conditions;
    }

    return {
        tableState,
        captureView,
        applyView,
        openedWithLink: cardTabOpenedWithLink(urlPrefix, useRoute().query),
    };
}
