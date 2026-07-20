<script setup lang="ts" generic="TRow extends Record<string, unknown>">
import { computed, ref, watch, type Component } from 'vue';
import DataTable, { type DataTableFilterMeta } from 'primevue/datatable';
import Column from 'primevue/column';
import { Setting, Sort, SortUp, SortDown, Rank } from '@element-plus/icons-vue';
import MvColumnToggle from '../MvColumnToggle/MvColumnToggle.vue';
import MvActiveFilterChips from '../MvActiveFilterChips/MvActiveFilterChips.vue';
import MvScrollFadeOverlay from '../MvScrollFadeOverlay/MvScrollFadeOverlay.vue';
import MvColumnFilterText from '../MvColumnFilter/MvColumnFilterText.vue';
import { resolveColumnFilterComponent } from '../MvColumnFilter/columnFilterRegistry';
import { interactionMode, closePrimeVueFilterOverlay, hasValue, describeValue } from '../MvColumnFilter/columnFilterDispatch';
import type { ActiveFilterChip } from '../MvActiveFilterChips/MvActiveFilterChips.vue';
import type { DataTableState, DataTableSortMeta } from '../../composables/useDataTableState';
import { usePagedScrollHeight } from '../../composables/usePagedScrollHeight';
import { useHorizontalScrollFade } from '../../composables/useHorizontalScrollFade';
import type { AdvancedDataTableColumn, AdvancedDataTableSearchConfig, AdvancedDataTableRowClickPayload } from './advancedDataTableTypes';

// The standard desktop table for the manager portal (see AGENTS.md's manager-portal rules) —
// column toggle/reorder/resize, per-column typed filters, active filter chips, server pagination,
// single-column sort, stable scroll height, horizontal scroll-fade. Deliberately knows nothing
// about Vue Router, GraphQL, Vendure types, money formatting, view-chip business logic, data
// loading, entity scoping, page URLs, or localStorage — every consumer keeps its own GraphQL
// query, sort-field mapping, currency formatting, routing, and state persistence
// (`useDataTableState`, called by the consumer, not this component). Extracted from
// CustomerOrdersDataTable.vue, the first full-featured consumer — see that component and the new
// CustomerInvoicesDataTable.vue for real usage examples.
const props = withDefaults(
    defineProps<{
        columns: AdvancedDataTableColumn[];
        rows: TRow[];
        loading: boolean;
        totalItems: number;
        dataKey: string;
        rowHeightPx: number;
        headerHeightPx: number;
        rowsPerPageOptions?: number[];
        search?: AdvancedDataTableSearchConfig;
        // Used only by the "Clear filters" action — the set of *valid* filter keys is derived
        // from `columns`/`search`, not from this object's own keys (not every valid filter needs
        // a default value).
        defaultFilters: Record<string, unknown>;
        emptyMessage?: string;
    }>(),
    {
        rowsPerPageOptions: () => [10, 20, 50],
        search: undefined,
        emptyMessage: 'No data',
    },
);

const emit = defineEmits<{
    'row-click': [payload: AdvancedDataTableRowClickPayload<TRow>];
    'reset-page': [];
    'update:page': [page: number];
    // Fired whenever "Clear filters" runs, in addition to the tableState mutation itself — lets a
    // consumer react to filters being cleared even for state this component doesn't know about
    // (e.g. Orders' `payment` column, a `custom`-type filter escape hatch wired to a business
    // prop/emit entirely outside tableState.filters).
    'clear-filters': [];
}>();

const tableState = defineModel<DataTableState>('tableState', { required: true });

// PrimeVue's default cell rendering only applies to columns with no `#cell-<field>` slot
// override. null/undefined render as empty; primitives as text; objects/arrays never render
// directly (no `[object Object]`) — a consumer that needs to show a nested/computed value must
// supply `#cell-<field>` (see advancedDataTableTypes.ts's doc comment on `field`).
const warnedFields = new Set<string>();
function defaultCellText(field: string, value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
        if (import.meta.env.DEV && !warnedFields.has(field)) {
            warnedFields.add(field);
            // eslint-disable-next-line no-console
            console.warn(`MvAdvancedDataTable: column "${field}" received an object/array value with no #cell-${field} slot — rendering empty instead of "[object Object]".`);
        }
        return '';
    }
    return String(value);
}

// Column order/width/visibility comes entirely from the consumer-owned `tableState` (v-model) —
// this component only ever reads/writes it, never persists it itself.
const visibleColumns = computed(() => {
    const byField = new Map(props.columns.map(c => [c.field, c]));
    const hidden = new Set(tableState.value.hiddenColumns);
    return tableState.value.columnOrder
        .filter(field => byField.has(field) && (!hidden.has(field) || byField.get(field)!.required))
        .map(field => {
            const col = byField.get(field)!;
            return { ...col, width: tableState.value.columnWidths[field] ?? col.width };
        });
});

const columnToggleItems = computed(() =>
    tableState.value.columnOrder
        .map(field => props.columns.find(c => c.field === field))
        .filter((c): c is AdvancedDataTableColumn => !!c)
        .map(c => ({
            key: c.field,
            label: c.header,
            required: c.required,
            visible: !!c.required || !tableState.value.hiddenColumns.includes(c.field),
        })),
);
function onColumnToggle(field: string): void {
    const hidden = new Set(tableState.value.hiddenColumns);
    if (hidden.has(field)) hidden.delete(field);
    else hidden.add(field);
    tableState.value.hiddenColumns = [...hidden];
}
function onColumnsReorder(order: string[]): void {
    tableState.value.columnOrder = order;
}

// See CustomerOrdersDataTable.vue's original doc comment (moved here verbatim): PrimeVue's own
// resizableColumns implementation applies a resized column's new width via its OWN <style>
// element injected into document.head with `!important` rules, never cleared except by another
// resize or the DataTable unmounting. Bumping this key forces a full remount, running PrimeVue's
// own cleanup, which is the only reliable way to undo a resize's visual effect after "Reset
// columns".
const tableRemountKey = ref(0);

// "Reset columns" restores layout only (order/width/hidden) — never filters/sort, a distinct user
// intent from "Clear filters" below.
function onColumnsReset(): void {
    tableState.value.hiddenColumns = [];
    tableState.value.columnOrder = props.columns.map(c => c.field);
    tableState.value.columnWidths = Object.fromEntries(props.columns.map(c => [c.field, c.width]));
    tableRemountKey.value++;
}

function onColumnResizeEnd(event: { element: HTMLElement; delta: number }): void {
    const headerText = event.element?.querySelector('.mv-advanced-data-table__col-title')?.textContent?.trim();
    const col = props.columns.find(c => c.header === headerText);
    if (!col) return;
    const current = tableState.value.columnWidths[col.field] ?? col.width;
    tableState.value.columnWidths = { ...tableState.value.columnWidths, [col.field]: current + event.delta };
}
function onColumnReorder(event: { dragIndex: number; dropIndex: number }): void {
    const order = [...tableState.value.columnOrder];
    const [moved] = order.splice(event.dragIndex, 1);
    order.splice(event.dropIndex, 0, moved);
    tableState.value.columnOrder = order;
}

// Fully custom, single-column sort (not PrimeVue's own `sortable`/`sort-mode` — fighting its
// whole-header click binding and internal hover/selected classes broke sorting outright in the
// original Orders table this was extracted from). Only columns declaring `sortField` render a
// sort button at all.
function toggleSort(col: AdvancedDataTableColumn): void {
    if (!col.sortField) return;
    const current = tableState.value.sort[0];
    const next: DataTableSortMeta =
        current?.field === col.field ? { field: col.field, order: current.order === 1 ? -1 : 1 } : { field: col.field, order: 1 };
    tableState.value.sort = [next];
}
function sortIconFor(col: AdvancedDataTableColumn): Component {
    const active = tableState.value.sort[0];
    if (active?.field !== col.field) return Sort;
    return active.order === 1 ? SortUp : SortDown;
}

// See CustomerOrdersDataTable.vue's original doc comment (moved here verbatim): PrimeVue's own
// header mousedown handler arms a native HTML5 column-drag on any mousedown in a sortable/
// reorderable `th` that isn't an <input>/<textarea>/the resize handle — nothing in that check
// knows about this component's own sort button or reorder handle, so without this, dragging the
// title, the sort button, or empty header space all start a column drag too. Bubble-phase
// listener on a stable ancestor, always runs after the `th`'s own mousedown already set
// `draggable`, so this only has to correct it back to `false`.
function onHeaderMousedown(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const th = target.closest('th');
    if (!th) return;
    const isHandle = !!target.closest('.mv-advanced-data-table__reorder-handle');
    if (!isHandle) (th as HTMLElement).draggable = false;
}

// PrimeVue only renders a column's funnel icon + filter overlay when the DataTable has
// `filterDisplay` set AND that column's field has an entry here — actual values never live here
// (`tableState.filters` is the single source of truth), this only makes PrimeVue draw the
// funnel/overlay chrome and own its open/close.
const columnFilters = ref<DataTableFilterMeta>(
    Object.fromEntries(props.columns.filter(c => c.filterConfig.type !== 'none').map(c => [c.field, { value: null, matchMode: 'equals' }])),
);

function onFilterValueChange(col: AdvancedDataTableColumn, value: unknown): void {
    tableState.value.filters = { ...tableState.value.filters, [col.field]: value };
    if (interactionMode(col.filterConfig) === 'instant-close') closePrimeVueFilterOverlay();
}
function filterActiveClass(field: string): string | undefined {
    return hasValue(tableState.value.filters[field]) ? 'mv-advanced-data-table__th--filtered' : undefined;
}
const activeFilterChips = computed<ActiveFilterChip[]>(() => {
    const f = tableState.value.filters;
    const chips: ActiveFilterChip[] = [];
    for (const col of props.columns) {
        if (col.filterConfig.type === 'none' || col.filterConfig.type === 'custom') continue;
        const value = f[col.field];
        if (!hasValue(value)) continue;
        chips.push({ key: col.field, label: `${col.header}: ${describeValue(col.filterConfig, value)}` });
    }
    return chips;
});
function onRemoveFilterChip(key: string): void {
    tableState.value.filters = { ...tableState.value.filters, [key]: props.defaultFilters[key] };
}
// "Clear filters" restores filters only — never column order/width/hidden/sort, the mirror image
// of "Reset columns" above.
function clearFilters(): void {
    tableState.value.filters = { ...props.defaultFilters };
    emit('clear-filters');
}

// PrimeVue's own paginator owns its current-page cursor (`first`, the row offset) entirely
// internally unless it's bound as a controlled v-model — real bug found live: without this
// binding, changing a filter re-fetches page 1's data (the consumer's own `page` ref resets
// correctly), but the paginator's own visible "current page" highlight stays wherever the user
// last clicked, showing a stale page number next to genuinely different data, and — worse — if
// the consumer's next fetch still used that stale page number (skip past the new, smaller
// filtered total), the table would silently show "no results" for a filter that has real matches
// on an earlier page. Binding `v-model:first` and forcibly resetting it alongside `reset-page`
// keeps the paginator's own visible cursor and the actual fetched data always describing the same
// page, since both resets now happen from the same place at the same time.
const first = ref(0);

// Auto-reset-to-page-1 invariant: any filter change (including the debounced search, which is
// just another entry in `tableState.filters`) means whatever page the consumer was on may no
// longer exist — the consumer owns the actual page number/fetch (outside this component's
// concern), so `reset-page` only signals "go fetch page 1 again"; this component resets its own
// paginator cursor (`first`) in the same breath, not relying on the consumer's next `rows` update
// to somehow fix the paginator's display on its own (it doesn't — see above).
//
// No "skip the first call" guard here (a real bug this session had, now removed): `watch()`
// without `immediate: true` never fires on its own at setup — the *first* time this callback runs
// is already a genuine, user-caused filter change, not a synthetic initial call to ignore. Adding
// a guard that skips "the first invocation" was silently eating that very first real filter
// change for every consumer of this component, not just Invoices (where it was first noticed) —
// the fetched data updated correctly (the consumer's own `page` ref did reset via `reset-page`
// firing... except it never fired at all here, since the guard swallowed it).
watch(
    () => tableState.value.filters,
    () => {
        first.value = 0;
        emit('reset-page');
    },
    { deep: true },
);

// Real bug found live: PrimeVue's own rows-per-page change does *not* reset to page 1 — its
// `onRowChange` recomputes an equivalent page for the new page size to roughly preserve scroll
// position (`Math.floor(d_first / d_rows)`), a doc comment previously here got this backwards.
// This project's own convention is "changing page size always goes back to page 1" (every
// consumer's own `watch([...deps, pageSize], () => page.value = 1)` already assumes this) — left
// unreconciled, that produces exactly the reported bug: the consumer refetches page 1 (its own
// watcher is right), but the paginator's own visual cursor stays wherever PrimeVue computed
// instead, showing e.g. "page 3" highlighted over page-1 data. Detecting a page-size change here
// (not a plain page-navigation click) and forcing the same `first = 0` + `reset-page` signal used
// for filter changes keeps both halves consistent, rather than trusting PrimeVue's own
// position-preserving math which this project deliberately doesn't want.
function onPage(event: { page: number; rows: number }): void {
    const pageSizeChanged = event.rows !== tableState.value.pageSize;
    tableState.value.pageSize = event.rows;
    if (pageSizeChanged) {
        first.value = 0;
        emit('reset-page');
    } else {
        emit('update:page', event.page + 1);
    }
}

function onRowClick(event: { data: TRow; originalEvent: Event }): void {
    emit('row-click', { row: event.data, originalEvent: event.originalEvent });
}

// Row/header height must be the real minimum rendered height — see usePagedScrollHeight's own
// doc comment: a `<td>`'s `height` CSS is only a minimum a browser can never shrink below, so
// these must be measured against the actual rendered table, not guessed.
const dynamicScrollHeight = usePagedScrollHeight(() => tableState.value.pageSize, {
    rowHeightPx: props.rowHeightPx,
    headerHeightPx: props.headerHeightPx,
});

// PrimeVue renders the actual scrollable element itself (`.p-datatable-table-container`) — this
// component doesn't own that markup, so useHorizontalScrollFade is handed a live-DOM getter
// instead of a template ref. `tableRemountKey` is read (not used to compute the element) purely
// to give the composable's internal watcher a reactive reason to re-query/re-attach after the
// `:key`-forced remount above.
const tableWrapper = ref<HTMLElement | null>(null);
function getScrollContainer(): HTMLElement | null {
    void tableRemountKey.value;
    return tableWrapper.value?.querySelector<HTMLElement>('.p-datatable-table-container') ?? null;
}
const { canScrollLeft, canScrollRight, scrollBy } = useHorizontalScrollFade(getScrollContainer);
</script>

<template>
    <div class="mv-advanced-data-table" @mousedown="onHeaderMousedown">
        <div class="mv-advanced-data-table__toolbar">
            <div class="mv-advanced-data-table__toolbar-start">
                <MvColumnFilterText
                    v-if="search"
                    :config="{ type: 'text', placeholder: search.placeholder, debounceMs: search.debounceMs }"
                    :model-value="(tableState.filters[search.filterKey] as string) ?? ''"
                    @update:model-value="tableState.filters = { ...tableState.filters, [search.filterKey]: $event }"
                />
                <slot name="toolbar-start" />
            </div>
            <div class="mv-advanced-data-table__toolbar-end">
                <slot name="toolbar-end" />
                <MvColumnToggle
                    :columns="columnToggleItems"
                    trigger-label=""
                    searchable
                    reorderable
                    show-footer
                    @toggle="onColumnToggle"
                    @reorder="onColumnsReorder"
                    @reset="onColumnsReset"
                >
                    <template #icon>
                        <Setting class="mv-advanced-data-table__btn-icon" />
                    </template>
                </MvColumnToggle>
            </div>
        </div>

        <MvActiveFilterChips :chips="activeFilterChips" @remove="onRemoveFilterChip" @clear-all="clearFilters" />

        <div ref="tableWrapper" class="mv-advanced-data-table__scroll-host">
            <MvScrollFadeOverlay
                :can-scroll-left="canScrollLeft"
                :can-scroll-right="canScrollRight"
                @scroll-left="scrollBy(-1)"
                @scroll-right="scrollBy(1)"
            />
            <DataTable
                :key="tableRemountKey"
                :value="rows"
                :loading="loading"
                :data-key="dataKey"
                lazy
                paginator
                v-model:first="first"
                :rows="tableState.pageSize"
                :rows-per-page-options="rowsPerPageOptions"
                :total-records="totalItems"
                scrollable
                :scroll-height="dynamicScrollHeight"
                resizable-columns
                column-resize-mode="expand"
                reorderable-columns
                filter-display="menu"
                v-model:filters="columnFilters"
                row-hover
                class="mv-advanced-data-table__grid"
                @page="onPage"
                @column-reorder="onColumnReorder"
                @column-resize-end="onColumnResizeEnd"
                @row-click="onRowClick"
            >
                <template #empty>
                    <slot name="empty">{{ emptyMessage }}</slot>
                </template>
                <Column
                    v-for="col in visibleColumns"
                    :key="col.field"
                    :field="col.field"
                    :style="{ width: col.width + 'px' }"
                    :pt="{ headerCell: { class: filterActiveClass(col.field) } }"
                    :show-filter-match-modes="false"
                    :show-filter-operator="false"
                    :show-add-button="false"
                    :show-apply-button="false"
                    :show-clear-button="false"
                >
                    <template #header>
                        <span class="mv-advanced-data-table__col-title">{{ col.header }}</span>
                        <button
                            v-if="col.sortField"
                            type="button"
                            class="mv-advanced-data-table__sort-btn"
                            :class="{ 'mv-advanced-data-table__sort-btn--active': tableState.sort[0]?.field === col.field }"
                            @click.stop="toggleSort(col)"
                        >
                            <component :is="sortIconFor(col)" class="mv-advanced-data-table__sort-icon" />
                        </button>
                        <span class="mv-advanced-data-table__reorder-handle" title="Drag to reorder column">
                            <Rank class="mv-advanced-data-table__reorder-icon" />
                        </span>
                    </template>

                    <template #body="{ data }">
                        <slot :name="`cell-${col.field}`" :data="data">{{ defaultCellText(col.field, (data as Record<string, unknown>)[col.field]) }}</slot>
                    </template>

                    <template v-if="col.filterConfig.type === 'custom'" #filter>
                        <slot :name="`filter-${col.field}`" />
                    </template>
                    <template v-else-if="col.filterConfig.type !== 'none'" #filter>
                        <component
                            :is="resolveColumnFilterComponent(col.filterConfig.type)"
                            :config="col.filterConfig"
                            :model-value="tableState.filters[col.field]"
                            @update:model-value="onFilterValueChange(col, $event)"
                            @close="closePrimeVueFilterOverlay"
                        />
                    </template>
                </Column>
            </DataTable>
        </div>
    </div>
</template>

<style scoped>
.mv-advanced-data-table__toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 8px;
}

.mv-advanced-data-table__toolbar-start {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}

.mv-advanced-data-table__toolbar-end {
    display: flex;
    align-items: center;
    gap: 8px;
}

.mv-advanced-data-table__btn-icon {
    width: 15px;
    height: 15px;
}

.mv-advanced-data-table__grid {
    width: 100%;
}

.mv-advanced-data-table__scroll-host {
    position: relative;
}

/* PrimeVue's default header layout puts the sort icon and the filter (funnel) icon at opposite
   ends of the header cell — `.p-datatable-column-header-content` defaults to
   `justify-content: space-between`, and `.p-datatable-filter` additionally carries its own
   `margin-inline-start: auto` in PrimeVue's base styles, which shoots the funnel to the far right
   on any column wider than its content regardless of justify-content. */
:deep(.p-datatable-column-header-content) {
    justify-content: flex-start;
    gap: 2px;
}

.mv-advanced-data-table__col-title {
    cursor: default;
}

.mv-advanced-data-table__sort-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    margin-inline-start: 8px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--el-text-color-secondary, #98a2b3);
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s;
}

.mv-advanced-data-table__sort-btn:hover {
    background: var(--el-color-primary-light-9, #e6faf4);
    color: var(--el-color-primary, #00b894);
}

.mv-advanced-data-table__sort-btn--active {
    color: var(--el-color-primary, #00b894);
}

.mv-advanced-data-table__sort-icon {
    width: 16px;
    height: 16px;
}

.mv-advanced-data-table__reorder-handle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    margin-inline: 4px 6px;
    border-radius: 6px;
    color: var(--el-text-color-secondary, #98a2b3);
    cursor: grab;
    transition: background-color 0.15s, color 0.15s;
}

.mv-advanced-data-table__reorder-handle:hover {
    background: var(--el-color-primary-light-9, #e6faf4);
    color: var(--el-color-primary, #00b894);
}

.mv-advanced-data-table__reorder-icon {
    width: 15px;
    height: 15px;
}

:deep(.p-datatable-column-resizer)::after {
    content: '';
    position: absolute;
    inset-inline-end: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 1px;
    height: 20px;
    background: var(--el-border-color, #e4e7ec);
}

:deep(.p-datatable-column-resizer:hover)::after {
    width: 2px;
    background: var(--el-color-primary, #00b894);
}

:deep(.p-datatable-filter) {
    margin-inline-start: 0;
}

:deep(.p-datatable-column-filter-button:hover) {
    background: var(--el-color-primary-light-9, #e6faf4) !important;
    color: var(--el-color-primary, #00b894) !important;
}

:deep(.p-datatable-column-filter-button) {
    width: 22px;
    height: 22px;
}

:deep(.mv-advanced-data-table__th--filtered .p-datatable-column-filter-button) {
    color: var(--el-color-primary, #00b894);
}
</style>
