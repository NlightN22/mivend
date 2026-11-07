import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import type { DataTableFilterMeta } from 'primevue/datatable';
import {
    interactionMode,
    closePrimeVueFilterOverlay,
    installFilterOverlayClickFix,
    hasValue,
    describeValue,
} from '../MvColumnFilter/columnFilterDispatch';
import type { FilterCondition } from '../MvFilterBuilder/filterBuilderTypes';
import type { ActiveFilterChip } from '../MvActiveFilterChips/MvActiveFilterChips.vue';
import type { DataTableState } from '../../composables/useDataTableState';
import type { AdvancedDataTableColumn } from './advancedDataTableTypes';

export function useColumnFilters(opts: {
    columns: () => AdvancedDataTableColumn[];
    defaultFilters: () => Record<string, unknown>;
    tableState: Ref<DataTableState>;
    conditions: Ref<FilterCondition[]>;
    onCleared: () => void;
}) {
    const { tableState } = opts;

    // PrimeVue draws a column's funnel/overlay only when its field has an entry here; the values
    // themselves live in `tableState.filters`.
    const columnFilters = ref<DataTableFilterMeta>({});
    watch(
        opts.columns,
        columns => {
            const next: DataTableFilterMeta = {};
            for (const c of columns) {
                if (c.filterConfig.type === 'none') continue;
                next[c.field] = columnFilters.value[c.field] ?? {
                    value: null,
                    matchMode: 'equals',
                };
            }
            columnFilters.value = next;
        },
        { immediate: true },
    );

    // An unchanged write would still replace the filters object, reset the page and refetch,
    // rebuilding the overlay under a user who is typing.
    function setFilter(key: string, value: unknown): void {
        if (JSON.stringify(tableState.value.filters[key]) === JSON.stringify(value)) return;
        tableState.value.filters = { ...tableState.value.filters, [key]: value };
    }

    function onFilterValueChange(col: AdvancedDataTableColumn, value: unknown): void {
        setFilter(col.field, value);
        if (interactionMode(col.filterConfig) === 'instant-close') closePrimeVueFilterOverlay();
    }

    let uninstallFilterOverlayClickFix: (() => void) | undefined;
    onMounted(() => {
        uninstallFilterOverlayClickFix = installFilterOverlayClickFix();
    });
    onBeforeUnmount(() => uninstallFilterOverlayClickFix?.());

    function isFiltered(field: string): boolean {
        return hasValue(tableState.value.filters[field]);
    }

    const activeFilterChips = computed<ActiveFilterChip[]>(() => {
        const f = tableState.value.filters;
        const chips: ActiveFilterChip[] = [];
        for (const col of opts.columns()) {
            if (col.filterConfig.type === 'none' || col.filterConfig.type === 'custom') continue;
            const value = f[col.field];
            if (!hasValue(value)) continue;
            chips.push({
                key: col.field,
                label: `${col.header}: ${describeValue(col.filterConfig, value)}`,
            });
        }
        return chips;
    });

    function onRemoveFilterChip(key: string): void {
        tableState.value.filters = {
            ...tableState.value.filters,
            [key]: opts.defaultFilters()[key],
        };
    }

    // Filters only; never column order/width/hidden/sort.
    function clearFilters(): void {
        tableState.value.filters = { ...opts.defaultFilters() };
        opts.conditions.value = [];
        opts.onCleared();
    }

    return {
        columnFilters,
        setFilter,
        onFilterValueChange,
        isFiltered,
        activeFilterChips,
        onRemoveFilterChip,
        clearFilters,
    };
}
