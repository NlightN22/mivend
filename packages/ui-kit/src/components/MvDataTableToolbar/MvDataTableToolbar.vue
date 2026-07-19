<script setup lang="ts">
import { computed } from 'vue';
import MvTableFilters, { type TableFilterFieldDef } from '../MvFilterBar/MvTableFilters.vue';
import MvColumnToggle from '../MvColumnToggle/MvColumnToggle.vue';
import MvFilterChips, { type FilterChip } from '../MvFilterChips/MvFilterChips.vue';
import type { MvDataTableColumn, DataTableColumnFilter } from '../MvTable/dataTableTypes';

// Single toolbar assembled from ONE column-def array (see dataTableTypes.ts's doc comment) —
// the consolidated shape recommended by TanStack Table's/shadcn's data-table pattern (column
// defs are the single source of truth for visibility + faceted filters, read by one toolbar
// component), instead of a page hand-wiring MvTableFilters + MvColumnToggle + MvFilterChips
// separately with three independently-authored config arrays. Real incident this replaces:
// every manager-portal table page maintained its own ad hoc `ORDER_COLUMNS`/`fields`/`CHIPS`
// trio with no shared shape, making every new table's filter/column work start from scratch.
//
// Chips stay a distinct optional concern (not derived from `columns`) — a chip is a *saved
// view* that can set several filter fields at once (e.g. OrdersPage's "Processing" chip sets
// both `state` and clears `reservationState`), not a single column's facet value, so it can't
// be reduced to column metadata. The page still owns chip→filters mapping logic; this toolbar
// only renders the row and forwards the click.
//
// Column-visibility *state* (the hidden-keys Set + its localStorage persistence) stays owned by
// the page via useColumnVisibility — it needs a page-specific storageKey — this component only
// renders MvColumnToggle from the already-computed toggleableColumns and forwards toggle clicks.
const props = defineProps<{
    columns: MvDataTableColumn[];
    filters: Record<string, string>;
    hiddenColumnKeys: Set<string>;
    chips?: FilterChip[];
    activeChip?: string;
    suggestions?: Record<string, string[]>;
    // Set when the table itself owns a richer column-management control (e.g.
    // OrdersDataTable.vue's PrimeVue Popover+MultiSelect) — avoids showing two redundant
    // "Columns" buttons on the same page.
    hideColumnToggle?: boolean;
}>();

const emit = defineEmits<{
    'update:filters': [value: Record<string, string>];
    reset: [];
    'toggle-column': [key: string];
    'select-chip': [key: string];
}>();

const filterFields = computed<TableFilterFieldDef[]>(() =>
    props.columns
        .filter((c): c is MvDataTableColumn & { filter: DataTableColumnFilter } => !!c.filter)
        .map(c => ({
            key: String(c.key),
            label: String(c.title ?? c.key),
            type: c.filter.kind,
            placeholder: c.filter.placeholder,
            options: c.filter.options,
        })),
);

const toggleableColumns = computed(() =>
    props.columns
        .filter(c => !c.required)
        .map(c => ({
            key: String(c.key),
            label: String(c.title ?? c.key),
            visible: !props.hiddenColumnKeys.has(String(c.key)),
        })),
);
</script>

<template>
    <div class="mv-data-table-toolbar">
        <MvFilterChips
            v-if="chips?.length"
            :chips="chips"
            :active="activeChip ?? ''"
            @select="emit('select-chip', $event)"
        />
        <div class="mv-data-table-toolbar__filters-row">
            <MvTableFilters
                v-if="filterFields.length"
                :fields="filterFields"
                :model-value="filters"
                :suggestions="suggestions ?? {}"
                @update:model-value="emit('update:filters', $event)"
                @reset="emit('reset')"
            />
            <div v-else class="mv-data-table-toolbar__spacer" />
            <MvColumnToggle
                v-if="!hideColumnToggle && toggleableColumns.length"
                :columns="toggleableColumns"
                @toggle="emit('toggle-column', $event)"
            />
        </div>
    </div>
</template>

<style scoped>
.mv-data-table-toolbar {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.mv-data-table-toolbar__filters-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
}

.mv-data-table-toolbar__spacer {
    flex: 1;
}
</style>
