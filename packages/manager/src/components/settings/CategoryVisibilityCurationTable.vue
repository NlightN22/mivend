<script setup lang="ts">
import { computed } from 'vue';
import {
    MvAdvancedDataTable,
    MvSelect,
    MvStatusBadge,
    useDataTableState,
    type AdvancedDataTableColumn,
    type SelectOption,
    type StatusBadgeVariant,
} from '@mivend/ui-kit';
import type { CategoryVisibilityCollection } from '../../api/categoryVisibility';

// See manager-table-standard skill. `name` is the identifying/required column, backed by a
// client-side toolbar search (same exemption reasoning as WarehouseCurationTable.vue — a bounded
// ERP-sourced list, no server filter args on `collections` worth wiring for this). `isPrivate`
// is the computed, feed-derived-or-overridden current state, shown read-only next to the
// human-editable `visibilityOverride` control (issue #90).
const props = defineProps<{
    collections: CategoryVisibilityCollection[];
    loading: boolean;
    savingCollectionId: string | null;
    administratorId: string;
}>();

const emit = defineEmits<{
    setOverride: [payload: { id: string; visibilityOverride: string | null }];
}>();

const OVERRIDE_OPTIONS: SelectOption[] = [
    { value: '', label: 'Auto (follow feed)' },
    { value: 'visible', label: 'Visible' },
    { value: 'hidden', label: 'Hidden' },
];

const ALL_COLUMNS: AdvancedDataTableColumn[] = [
    {
        field: 'name',
        header: 'Category',
        width: 260,
        required: true,
        filterConfig: { type: 'text', placeholder: 'Name contains…' },
        mobile: { primary: true },
    },
    { field: 'slug', header: 'Slug', width: 140, filterConfig: { type: 'none' }, mobile: { hidden: true } },
    {
        field: 'isPrivate',
        header: 'Current visibility',
        width: 160,
        filterConfig: { type: 'none' },
    },
    { field: 'visibilityOverride', header: 'Override', width: 200, filterConfig: { type: 'none' } },
];

interface CategoryVisibilityFilterState {
    [key: string]: unknown;
    name: string;
}
const BLANK_FILTERS: CategoryVisibilityFilterState = { name: '' };

const { state: tableState } = useDataTableState<CategoryVisibilityFilterState>(
    `category-visibility-curation-datatable:${props.administratorId || 'anonymous'}`,
    {
        columnOrder: ALL_COLUMNS.map(c => c.field),
        columnWidths: Object.fromEntries(ALL_COLUMNS.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: [],
        filters: BLANK_FILTERS,
        pageSize: 25,
    },
    {
        columns: ALL_COLUMNS,
        allowedFilterKeys: ALL_COLUMNS.filter(c => c.filterConfig.type !== 'none').map(c => c.field),
    },
);

interface CategoryVisibilityRow {
    [key: string]: unknown;
    id: string;
    name: string;
    slug: string;
    isPrivate: boolean;
    isPrivateVariant: StatusBadgeVariant;
    visibilityOverride: string;
}
const rows = computed<CategoryVisibilityRow[]>(() =>
    props.collections
        .filter(c =>
            c.name.toLowerCase().includes((tableState.value.filters.name ?? '').toLowerCase()),
        )
        .map(c => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            isPrivate: c.isPrivate,
            isPrivateVariant: c.isPrivate ? 'neutral' : 'success',
            visibilityOverride: c.customFields?.visibilityOverride ?? '',
        })),
);
</script>

<template>
    <MvAdvancedDataTable
        v-model:table-state="tableState"
        :columns="ALL_COLUMNS"
        :rows="rows"
        :loading="loading"
        :total-items="rows.length"
        :page="1"
        data-key="id"
        :row-height-px="49"
        :header-height-px="65"
        :default-filters="BLANK_FILTERS"
        :search="{ filterKey: 'name', placeholder: 'Search categories…' }"
        empty-message="No categories match your search"
    >
        <template #cell-isPrivate="{ data }">
            <MvStatusBadge :variant="(data as CategoryVisibilityRow).isPrivateVariant">
                {{ (data as CategoryVisibilityRow).isPrivate ? 'Hidden' : 'Visible' }}
            </MvStatusBadge>
        </template>
        <template #cell-visibilityOverride="{ data }">
            <MvSelect
                :model-value="(data as CategoryVisibilityRow).visibilityOverride"
                :options="OVERRIDE_OPTIONS"
                :disabled="savingCollectionId === (data as CategoryVisibilityRow).id"
                @update:model-value="
                    (value: string) =>
                        emit('setOverride', {
                            id: (data as CategoryVisibilityRow).id,
                            visibilityOverride: value === '' ? null : value,
                        })
                "
            />
        </template>
    </MvAdvancedDataTable>
</template>
