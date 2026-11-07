<script setup lang="ts" generic="TRow extends Record<string, unknown>">
import { computed, ref, useSlots } from 'vue';
import MvScrollFadeOverlay from '../MvScrollFadeOverlay/MvScrollFadeOverlay.vue';
import MvActiveFilterChips from '../MvActiveFilterChips/MvActiveFilterChips.vue';
import type { FilterCondition } from '../MvFilterBuilder/filterBuilderTypes';
import MvAdvancedMobileCardList from './MvAdvancedMobileCardList.vue';
import AdvancedDataTableToolbar from './AdvancedDataTableToolbar.vue';
import AdvancedDataTableGrid from './AdvancedDataTableGrid.vue';
import { isSkeletonRow, skeletonRowCount, skeletonRows } from './tableSkeleton';
import type { DataTableState } from '../../composables/useDataTableState';
import { usePagedScrollHeight } from '../../composables/usePagedScrollHeight';
import { useIsMobileViewport } from '../../composables/useIsMobileViewport';
import {
    toFilterColumns,
    type AdvancedDataTableColumn,
    type AdvancedDataTableSearchConfig,
    type AdvancedDataTableRowClickPayload,
} from './advancedDataTableTypes';
import { createDefaultCellText } from './createDefaultCellText';
import { useColumnLayout } from './useColumnLayout';
import { useColumnSort } from './useColumnSort';
import { useColumnFilters } from './useColumnFilters';
import { useRowSelection } from './useRowSelection';
import { useTablePaging } from './useTablePaging';
import { useTableScrollHost } from './useTableScrollHost';

// The standard desktop table for the manager portal (see the manager-portal-rules skill): column
// toggle/resize, typed column filters, filter chips, server pagination, single-column sort,
// stable scroll height, scroll fade. It knows nothing about routing, GraphQL, money or storage;
// the consumer owns data loading and persists state via `useDataTableState`.
const props = withDefaults(
    defineProps<{
        columns: AdvancedDataTableColumn[];
        rows: TRow[];
        loading: boolean;
        totalItems: number;
        dataKey: string;
        // Used only by the mobile card view's pagination; the desktop paginator tracks its own cursor.
        page: number;
        rowHeightPx: number;
        headerHeightPx: number;
        rowsPerPageOptions?: number[];
        search?: AdvancedDataTableSearchConfig;
        // Only the "Clear filters" values; valid filter keys come from `columns`/`search`.
        defaultFilters: Record<string, unknown>;
        emptyMessage?: string;
        // Opt-in checkbox column; a selection swaps the toolbar for a bulk-actions bar.
        selectable?: boolean;
        // Selected `String(row[dataKey])` ids, owned by the consumer (v-model), never persisted here.
        selectedIds?: Set<string>;
        // Gates which rows can be selected; every row by default.
        rowSelectable?: (row: TRow) => boolean;
    }>(),
    {
        rowsPerPageOptions: () => [10, 20, 50],
        search: undefined,
        emptyMessage: 'No data',
        selectable: false,
        selectedIds: () => new Set(),
        rowSelectable: () => true,
    },
);

const emit = defineEmits<{
    'row-click': [payload: AdvancedDataTableRowClickPayload<TRow>];
    'reset-page': [];
    'update:page': [page: number];
    // Also fires for state this component does not know about (a `custom` filter wired outside tableState).
    'clear-filters': [];
    'update:selectedIds': [ids: Set<string>];
}>();

const tableState = defineModel<DataTableState>('tableState', { required: true });
// Conditions of the toolbar Filter builder, for columns that declare `filterType`.
const conditions = defineModel<FilterCondition[]>('conditions', { default: () => [] });
const filterColumns = computed(() => toFilterColumns(props.columns));
const defaultCellText = createDefaultCellText();

const containerWidth = ref(0);
const layout = useColumnLayout({
    columns: () => props.columns,
    selectable: () => props.selectable,
    tableState,
    containerWidth,
});
const { visibleColumns } = layout;
const { toggleSort, sortIconFor } = useColumnSort(tableState);
const filters = useColumnFilters({
    columns: () => props.columns,
    defaultFilters: () => props.defaultFilters,
    tableState,
    conditions,
    onCleared: () => emit('clear-filters'),
});
const selection = useRowSelection<TRow>({
    rows: () => props.rows,
    dataKey: () => props.dataKey,
    selectedIds: () => props.selectedIds,
    rowSelectable: () => props.rowSelectable,
    onChange: ids => emit('update:selectedIds', ids),
});
const { first, onPage } = useTablePaging({
    tableState,
    conditions,
    onResetPage: () => emit('reset-page'),
    onPageChange: page => emit('update:page', page),
});
const { tableWrapper, canScrollLeft, canScrollRight, scrollBy } = useTableScrollHost(
    containerWidth,
    layout.tableRemountKey,
);

// Measured against the rendered table; see usePagedScrollHeight.
const dynamicScrollHeight = usePagedScrollHeight(() => tableState.value.pageSize, {
    rowHeightPx: props.rowHeightPx,
    headerHeightPx: props.headerHeightPx,
});

// Same breakpoint as MvTable/MvAppTopbar/MvAppMobileNav; cards are a separate render path.
const isMobile = useIsMobileViewport(800);
const selectionActive = computed(() => props.selectable && props.selectedIds.size > 0);

// Skeleton rows only replace an empty table; a reload keeps the previous rows under PrimeVue's overlay.
const showSkeleton = computed(() => props.loading && !props.rows.length);
const gridRows = computed<TRow[]>(() =>
    showSkeleton.value
        ? (skeletonRows(
              props.dataKey,
              skeletonRowCount(tableState.value.pageSize),
          ) as unknown as TRow[])
        : props.rows,
);

// Forward only the slots the consumer supplied, or the grid's default cell text would be shadowed.
const slots = useSlots();
function forwardedSlotNames(prefix: string): string[] {
    return Object.keys(slots).filter(name => name.startsWith(prefix));
}

function onRowClick(event: { data: TRow; originalEvent: Event }): void {
    if (isSkeletonRow(event.data, props.dataKey)) return;
    emit('row-click', { row: event.data, originalEvent: event.originalEvent });
}
</script>

<template>
    <div
        class="mv-advanced-data-table"
        :aria-busy="loading"
        :style="{ '--mv-skeleton-row-height': `${rowHeightPx}px` }"
    >
        <span v-if="loading" class="mv-advanced-data-table__sr-only" role="status">Loading</span>
        <AdvancedDataTableToolbar
            v-model:conditions="conditions"
            :search="search"
            :search-value="(tableState.filters[search?.filterKey ?? ''] as string) ?? ''"
            :filter-columns="filterColumns"
            :column-toggle-items="layout.columnToggleItems.value"
            :is-mobile="isMobile"
            :selected-ids="selectedIds"
            :selection-active="selectionActive"
            @search-change="search && filters.setFilter(search.filterKey, $event)"
            @reset-selection="selection.resetSelection"
            @column-toggle="layout.onColumnToggle"
            @columns-reorder="layout.onColumnsReorder"
            @columns-reset="layout.onColumnsReset"
        >
            <template #selection-actions="slotProps">
                <slot name="selection-actions" v-bind="slotProps" />
            </template>
            <template #toolbar-start><slot name="toolbar-start" /></template>
            <template #toolbar-end><slot name="toolbar-end" /></template>
        </AdvancedDataTableToolbar>

        <!-- Per-column filters have no UI on mobile, and selection hides the chips like the toolbar. -->
        <MvActiveFilterChips
            v-if="!isMobile && !selectionActive"
            :chips="filters.activeFilterChips.value"
            @remove="filters.onRemoveFilterChip"
            @clear-all="filters.clearFilters"
        />

        <MvAdvancedMobileCardList
            v-if="isMobile"
            :columns="visibleColumns"
            :rows="rows"
            :data-key="dataKey"
            :loading="loading"
            :total-items="totalItems"
            :page="page"
            :page-size="tableState.pageSize"
            :empty-message="emptyMessage"
            @row-click="emit('row-click', $event)"
            @update:page="p => emit('update:page', p)"
        >
            <template #empty>
                <slot name="empty">{{ emptyMessage }}</slot>
            </template>
            <template
                v-for="col in visibleColumns"
                :key="col.field"
                #[`cell-${col.field}`]="slotProps"
            >
                <slot :name="`cell-${col.field}`" v-bind="slotProps">{{
                    defaultCellText(col.field, slotProps.data)
                }}</slot>
            </template>
        </MvAdvancedMobileCardList>

        <div v-else ref="tableWrapper" class="mv-advanced-data-table__scroll-host">
            <MvScrollFadeOverlay
                :can-scroll-left="canScrollLeft"
                :can-scroll-right="canScrollRight"
                @scroll-left="scrollBy(-1)"
                @scroll-right="scrollBy(1)"
            />
            <AdvancedDataTableGrid
                v-model:first="first"
                v-model:column-filters="filters.columnFilters.value"
                :rows="gridRows"
                :columns="visibleColumns"
                :loading="loading"
                :show-skeleton="showSkeleton"
                :data-key="dataKey"
                :total-items="totalItems"
                :rows-per-page-options="rowsPerPageOptions"
                :empty-message="emptyMessage"
                :scroll-height="dynamicScrollHeight"
                :remount-key="layout.tableRemountKey.value"
                :table-state="tableState"
                :selectable="selectable"
                :header-checkbox="selection.headerCheckboxState.value"
                :selectable-row-count="selection.selectablePageRows.value.length"
                :is-row-selected="selection.isRowSelected"
                :row-selectable="rowSelectable"
                :is-filtered="filters.isFiltered"
                :sort-icon-for="sortIconFor"
                :default-cell-text="defaultCellText"
                @page="onPage"
                @column-resize-end="layout.onColumnResizeEnd"
                @row-click="onRowClick"
                @toggle-sort="toggleSort"
                @toggle-row="selection.toggleRowSelected"
                @toggle-all="selection.toggleSelectAllOnPage"
                @filter-change="filters.onFilterValueChange"
            >
                <template #empty>
                    <slot name="empty">{{ emptyMessage }}</slot>
                </template>
                <template
                    v-for="name in forwardedSlotNames('cell-')"
                    :key="name"
                    #[name]="slotProps"
                >
                    <slot :name="name" v-bind="slotProps" />
                </template>
                <template v-for="name in forwardedSlotNames('filter-')" :key="name" #[name]>
                    <slot :name="name" />
                </template>
            </AdvancedDataTableGrid>
        </div>
    </div>
</template>

<style scoped src="./MvAdvancedDataTable.css"></style>
