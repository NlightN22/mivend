<script setup lang="ts" generic="TRow extends Record<string, unknown>">
import type { Component } from 'vue';
import DataTable, { type DataTableFilterMeta } from 'primevue/datatable';
import Column from 'primevue/column';
import MvCheckbox from '../MvCheckbox/MvCheckbox.vue';
import MvSkeleton from '../MvSkeleton/MvSkeleton.vue';
import { resolveColumnFilterComponent } from '../MvColumnFilter/columnFilterRegistry';
import { closePrimeVueFilterOverlay } from '../MvColumnFilter/columnFilterDispatch';
import type { DataTableState } from '../../composables/useDataTableState';
import type { AdvancedDataTableColumn } from './advancedDataTableTypes';
import { isSkeletonRow } from './tableSkeleton';
import { columnStyle } from './useColumnLayout';

defineProps<{
    rows: TRow[];
    columns: AdvancedDataTableColumn[];
    loading: boolean;
    showSkeleton: boolean;
    dataKey: string;
    totalItems: number;
    rowsPerPageOptions: number[];
    emptyMessage: string;
    scrollHeight: string;
    remountKey: number;
    tableState: DataTableState;
    selectable: boolean;
    headerCheckbox: { checked: boolean; indeterminate: boolean };
    selectableRowCount: number;
    isRowSelected: (row: TRow) => boolean;
    rowSelectable: (row: TRow) => boolean;
    isFiltered: (field: string) => boolean;
    sortIconFor: (col: AdvancedDataTableColumn) => Component;
    defaultCellText: (field: string, row: unknown) => string;
}>();

const emit = defineEmits<{
    page: [event: { page: number; rows: number }];
    'column-resize-end': [event: { element: HTMLElement; delta: number }];
    'row-click': [event: { data: TRow; originalEvent: Event }];
    'toggle-sort': [col: AdvancedDataTableColumn];
    'toggle-row': [row: TRow];
    'toggle-all': [];
    'filter-change': [col: AdvancedDataTableColumn, value: unknown];
}>();

const first = defineModel<number>('first', { required: true });
const columnFilters = defineModel<DataTableFilterMeta>('columnFilters', { required: true });
</script>

<template>
    <DataTable
        :key="remountKey"
        :value="rows"
        :loading="loading && !showSkeleton"
        :data-key="dataKey"
        lazy
        paginator
        v-model:first="first"
        :rows="tableState.pageSize"
        :rows-per-page-options="rowsPerPageOptions"
        :total-records="totalItems"
        scrollable
        :scroll-height="scrollHeight"
        resizable-columns
        column-resize-mode="expand"
        filter-display="menu"
        v-model:filters="columnFilters"
        row-hover
        :row-class="
            (row: TRow) =>
                isSkeletonRow(row, dataKey) ? 'mv-advanced-data-table__skeleton-row' : ''
        "
        class="mv-advanced-data-table__grid"
        @page="emit('page', $event)"
        @column-resize-end="emit('column-resize-end', $event)"
        @row-click="emit('row-click', $event)"
    >
        <template #empty>
            <slot name="empty">{{ emptyMessage }}</slot>
        </template>
        <Column v-if="selectable" field="__select" :style="{ width: '48px' }">
            <template #header>
                <MvCheckbox
                    :model-value="headerCheckbox.checked"
                    :indeterminate="headerCheckbox.indeterminate"
                    :disabled="selectableRowCount === 0"
                    @update:model-value="emit('toggle-all')"
                />
            </template>
            <template #body="{ data }">
                <MvSkeleton v-if="showSkeleton" width="16px" height="16px" aria-hidden="true" />
                <MvCheckbox
                    v-else
                    :model-value="isRowSelected(data as TRow)"
                    :disabled="!rowSelectable(data as TRow)"
                    @update:model-value="emit('toggle-row', data as TRow)"
                />
            </template>
        </Column>
        <Column
            v-for="col in columns"
            :key="col.field"
            :field="col.field"
            :style="columnStyle(col)"
            :show-filter-match-modes="false"
            :show-filter-operator="false"
            :show-add-button="false"
            :show-apply-button="false"
            :show-clear-button="false"
        >
            <template #header>
                <span class="mv-advanced-data-table__col-title">{{ col.header }}</span>
                <i
                    class="mv-advanced-data-table__filter-flag"
                    :class="{ 'is-on': isFiltered(col.field) }"
                />
                <button
                    v-if="col.sortField"
                    type="button"
                    class="mv-advanced-data-table__sort-btn"
                    :class="{
                        'mv-advanced-data-table__sort-btn--active':
                            tableState.sort[0]?.field === col.field,
                    }"
                    @click.stop="emit('toggle-sort', col)"
                >
                    <component :is="sortIconFor(col)" class="mv-advanced-data-table__sort-icon" />
                </button>
            </template>

            <template #body="{ data }">
                <MvSkeleton v-if="showSkeleton" width="70%" height="14px" aria-hidden="true" />
                <slot v-else :name="`cell-${col.field}`" :data="data">
                    <span
                        class="mv-advanced-data-table__cell-text"
                        :title="defaultCellText(col.field, data)"
                        >{{ defaultCellText(col.field, data) }}</span
                    >
                </slot>
            </template>

            <template v-if="col.filterConfig.type === 'custom'" #filter>
                <slot :name="`filter-${col.field}`" />
            </template>
            <template v-else-if="col.filterConfig.type !== 'none'" #filter>
                <component
                    :is="resolveColumnFilterComponent(col.filterConfig.type)"
                    :config="col.filterConfig"
                    :model-value="tableState.filters[col.field]"
                    @update:model-value="emit('filter-change', col, $event)"
                    @close="closePrimeVueFilterOverlay"
                />
            </template>
        </Column>
    </DataTable>
</template>

<style scoped src="./AdvancedDataTableGrid.css"></style>
