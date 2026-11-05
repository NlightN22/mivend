<script setup lang="ts">
import { computed, ref } from 'vue';
import {
    MvAdvancedDataTable,
    MvSelect,
    MvStatusBadge,
    useDataTableState,
    type AdvancedDataTableColumn,
    type SelectOption,
    type StatusBadgeVariant,
} from '@mivend/ui-kit';
import {
    describeCategoryVisibility,
    type CategoryVisibilityCollection,
} from '../../api/categoryVisibility';
import { buildCategoryTreeRows } from '../../utils/categoryVisibilityTree';

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

const HIDDEN_BY_PARENT = 'Hidden by parent: a hidden category hides everything below it';
const LOCKED_OPTIONS: SelectOption[] = OVERRIDE_OPTIONS.filter(o => o.value !== 'visible');
const STALE_VISIBLE_OPTIONS: SelectOption[] = OVERRIDE_OPTIONS.map(o =>
    o.value === 'visible' ? { ...o, label: 'Visible (ignored: hidden by parent)' } : o,
);

function optionsFor(row: {
    hiddenByAncestor: boolean;
    visibilityOverride: string;
}): SelectOption[] {
    if (!row.hiddenByAncestor) return OVERRIDE_OPTIONS;
    return row.visibilityOverride === 'visible' ? STALE_VISIBLE_OPTIONS : LOCKED_OPTIONS;
}

const ALL_COLUMNS: AdvancedDataTableColumn[] = [
    {
        field: 'name',
        header: 'Category',
        width: 340,
        required: true,
        filterConfig: { type: 'text', placeholder: 'Name contains…' },
        mobile: { primary: true },
    },
    {
        field: 'slug',
        header: 'Slug',
        width: 140,
        filterConfig: { type: 'none' },
        mobile: { hidden: true },
    },
    {
        field: 'isPrivate',
        header: 'Current visibility',
        width: 160,
        filterConfig: { type: 'none' },
    },
    {
        field: 'hiddenReason',
        header: 'Hidden reason',
        width: 160,
        filterConfig: { type: 'none' },
        mobile: { hidden: true },
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
        allowedFilterKeys: ALL_COLUMNS.filter(c => c.filterConfig.type !== 'none').map(
            c => c.field,
        ),
    },
);

interface CategoryVisibilityRow {
    [key: string]: unknown;
    id: string;
    name: string;
    slug: string;
    depth: number;
    hasChildren: boolean;
    expanded: boolean;
    hiddenReason: string;
    hiddenByAncestor: boolean;
    isPrivate: boolean;
    isPrivateVariant: StatusBadgeVariant;
    visibilityOverride: string;
}
const visibilityInfo = computed(() => describeCategoryVisibility(props.collections));
const expandedIds = ref(new Set<string>());
function toggle(id: string): void {
    const next = new Set(expandedIds.value);
    if (!next.delete(id)) next.add(id);
    expandedIds.value = next;
}
const rows = computed<CategoryVisibilityRow[]>(() =>
    buildCategoryTreeRows(
        props.collections,
        expandedIds.value,
        tableState.value.filters.name ?? '',
    ).map(({ item: c, depth, hasChildren, expanded }) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        depth,
        hasChildren,
        expanded,
        hiddenReason: visibilityInfo.value.get(c.id)?.hiddenReason || '—',
        hiddenByAncestor: visibilityInfo.value.get(c.id)?.hiddenByAncestor ?? false,
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
        <template #cell-name="{ data }">
            <span
                class="category-tree__name"
                :style="{ paddingLeft: `${(data as CategoryVisibilityRow).depth * 20}px` }"
            >
                <button
                    v-if="(data as CategoryVisibilityRow).hasChildren"
                    type="button"
                    class="category-tree__toggle"
                    :aria-expanded="(data as CategoryVisibilityRow).expanded"
                    :aria-label="(data as CategoryVisibilityRow).expanded ? 'Collapse' : 'Expand'"
                    @click="toggle((data as CategoryVisibilityRow).id)"
                >
                    {{ (data as CategoryVisibilityRow).expanded ? '▾' : '▸' }}
                </button>
                <span v-else class="category-tree__toggle" />
                {{ (data as CategoryVisibilityRow).name }}
            </span>
        </template>
        <template #cell-isPrivate="{ data }">
            <MvStatusBadge :variant="(data as CategoryVisibilityRow).isPrivateVariant">
                {{ (data as CategoryVisibilityRow).isPrivate ? 'Hidden' : 'Visible' }}
            </MvStatusBadge>
        </template>
        <template #cell-visibilityOverride="{ data }">
            <MvSelect
                :title="
                    (data as CategoryVisibilityRow).hiddenByAncestor ? HIDDEN_BY_PARENT : undefined
                "
                :model-value="(data as CategoryVisibilityRow).visibilityOverride"
                :options="optionsFor(data as CategoryVisibilityRow)"
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

<style scoped>
.category-tree__name {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.category-tree__toggle {
    width: 22px;
    height: 22px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--el-text-color-secondary, #6b7280);
    cursor: pointer;
}
</style>
