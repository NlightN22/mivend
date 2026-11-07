import type { Component, Ref } from 'vue';
import { Sort, SortUp, SortDown } from '@element-plus/icons-vue';
import type { DataTableState, DataTableSortMeta } from '../../composables/useDataTableState';
import type { AdvancedDataTableColumn } from './advancedDataTableTypes';

// Custom single-column sort: PrimeVue's own `sortable` fights its whole-header click binding.
export function useColumnSort(tableState: Ref<DataTableState>) {
    function toggleSort(col: AdvancedDataTableColumn): void {
        if (!col.sortField) return;
        const current = tableState.value.sort[0];
        const next: DataTableSortMeta =
            current?.field === col.field
                ? { field: col.field, order: current.order === 1 ? -1 : 1 }
                : { field: col.field, order: 1 };
        tableState.value.sort = [next];
    }

    function sortIconFor(col: AdvancedDataTableColumn): Component {
        const active = tableState.value.sort[0];
        if (active?.field !== col.field) return Sort;
        return active.order === 1 ? SortUp : SortDown;
    }

    return { toggleSort, sortIconFor };
}
