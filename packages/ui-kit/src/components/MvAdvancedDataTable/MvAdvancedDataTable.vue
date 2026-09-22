<script setup lang="ts" generic="TRow extends Record<string, unknown>">
import { computed, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue';
import DataTable, { type DataTableFilterMeta } from 'primevue/datatable';
import Column from 'primevue/column';
import { Setting, Sort, SortUp, SortDown } from '@element-plus/icons-vue';
import MvButton from '../MvButton/MvButton.vue';
import MvCheckbox from '../MvCheckbox/MvCheckbox.vue';
import MvColumnToggle from '../MvColumnToggle/MvColumnToggle.vue';
import MvActiveFilterChips from '../MvActiveFilterChips/MvActiveFilterChips.vue';
import MvScrollFadeOverlay from '../MvScrollFadeOverlay/MvScrollFadeOverlay.vue';
import MvColumnFilterText from '../MvColumnFilter/MvColumnFilterText.vue';
import { resolveColumnFilterComponent } from '../MvColumnFilter/columnFilterRegistry';
import {
    interactionMode,
    closePrimeVueFilterOverlay,
    installFilterOverlayClickFix,
    hasValue,
    describeValue,
} from '../MvColumnFilter/columnFilterDispatch';
import MvAdvancedMobileCardList from './MvAdvancedMobileCardList.vue';
import type { ActiveFilterChip } from '../MvActiveFilterChips/MvActiveFilterChips.vue';
import type { DataTableState, DataTableSortMeta } from '../../composables/useDataTableState';
import { usePagedScrollHeight } from '../../composables/usePagedScrollHeight';
import { useHorizontalScrollFade } from '../../composables/useHorizontalScrollFade';
import { useIsMobileViewport } from '../../composables/useIsMobileViewport';
import type { AdvancedDataTableColumn, AdvancedDataTableSearchConfig, AdvancedDataTableRowClickPayload } from './advancedDataTableTypes';

// The standard desktop table for the manager portal (see the manager-portal-rules skill) —
// column toggle/resize, per-column typed filters, active filter chips, server pagination,
// single-column sort, stable scroll height, horizontal scroll-fade. Column reorder lives only in
// the MvColumnToggle settings menu (drag-in-header reorder was removed — real feedback: it was
// unwanted table-header clutter, and its leftover header mousedown-correction hack still left a
// misleading "move" cursor over empty header space with no actual drag behind it). Deliberately
// knows nothing
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
        // Only used by the mobile card view's own MvPagination (see MvAdvancedMobileCardList.vue)
        // — the desktop <DataTable> tracks its paginator cursor itself via `first`/`tableState.
        // pageSize`, so this is otherwise redundant with what the consumer already owns.
        page: number;
        rowHeightPx: number;
        headerHeightPx: number;
        rowsPerPageOptions?: number[];
        search?: AdvancedDataTableSearchConfig;
        // Used only by the "Clear filters" action — the set of *valid* filter keys is derived
        // from `columns`/`search`, not from this object's own keys (not every valid filter needs
        // a default value).
        defaultFilters: Record<string, unknown>;
        emptyMessage?: string;
        // Opt-in row selection (Vendure-dashboard-style: a checkbox column, a header select-all-
        // on-page checkbox, and — once something's selected — the toolbar's search/filters swap
        // for a "N selected" bar with the consumer's own bulk actions + a Reset selection button).
        // Off by default — most tables have no bulk actions at all.
        selectable?: boolean;
        // Only meaningful when `selectable`. Row ids currently selected, as strings (matching
        // `String(row[dataKey])` — the same coercion `data-key` itself implies). Owned by the
        // consumer (a v-model), never persisted by this component — selection is a live, in-
        // session action, not a display preference like column order/width/sort.
        selectedIds?: Set<string>;
        // Only meaningful when `selectable`. Gates which rows can be selected at all (e.g. a row
        // that's missing required data or already in a terminal state) — defaults to "every row
        // selectable" when omitted.
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
    // Fired whenever "Clear filters" runs, in addition to the tableState mutation itself — lets a
    // consumer react to filters being cleared even for state this component doesn't know about
    // (e.g. Orders' `payment` column, a `custom`-type filter escape hatch wired to a business
    // prop/emit entirely outside tableState.filters).
    'clear-filters': [];
    'update:selectedIds': [ids: Set<string>];
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
    let next = current + event.delta;
    if (col.minWidth) next = Math.max(next, col.minWidth);
    if (col.maxWidth) next = Math.min(next, col.maxWidth);
    tableState.value.columnWidths = { ...tableState.value.columnWidths, [col.field]: next };
}

// `table-layout: fixed` (see the component's own doc comment) makes `width` an exact,
// non-negotiable column width — long unbroken cell content (e.g. a legal name) truncates via
// ellipsis instead of stretching the column and squeezing every column after it off-screen
// (real incident: exactly this, reported live on the Activation table). `minWidth`/`maxWidth`
// only matter for user-driven resize (onColumnResizeEnd clamps to them) since `width` alone
// already fixes the column's width otherwise.
function columnStyle(col: AdvancedDataTableColumn): Record<string, string> {
    const style: Record<string, string> = { width: `${col.width}px` };
    if (col.minWidth) style.minWidth = `${col.minWidth}px`;
    if (col.maxWidth) style.maxWidth = `${col.maxWidth}px`;
    return style;
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

// See installFilterOverlayClickFix's own doc comment — fixes a real bug where opening a second
// column's filter overlay left the first one open, confirmed live via Playwright.
let uninstallFilterOverlayClickFix: (() => void) | undefined;
onMounted(() => {
    uninstallFilterOverlayClickFix = installFilterOverlayClickFix();
});
onBeforeUnmount(() => uninstallFilterOverlayClickFix?.());
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

// Selection only ever spans the currently loaded page — same known, already-tracked limitation
// as every consumer's previous ad hoc "Select page" button (issue #136, "bulk-select all rows
// matching the current filter, not just the loaded page"), not solved here.
function rowId(row: TRow): string {
    return String(row[props.dataKey]);
}
function isRowSelected(row: TRow): boolean {
    return props.selectedIds.has(rowId(row));
}
function toggleRowSelected(row: TRow): void {
    if (!props.rowSelectable(row)) return;
    const next = new Set(props.selectedIds);
    const id = rowId(row);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    emit('update:selectedIds', next);
}
const selectablePageRows = computed(() => props.rows.filter(r => props.rowSelectable(r)));
const headerCheckboxState = computed<{ checked: boolean; indeterminate: boolean }>(() => {
    const selectable = selectablePageRows.value;
    if (selectable.length === 0) return { checked: false, indeterminate: false };
    const selectedCount = selectable.filter(isRowSelected).length;
    return {
        checked: selectedCount === selectable.length,
        indeterminate: selectedCount > 0 && selectedCount < selectable.length,
    };
});
function toggleSelectAllOnPage(): void {
    const next = new Set(props.selectedIds);
    if (headerCheckboxState.value.checked) {
        for (const row of selectablePageRows.value) next.delete(rowId(row));
    } else {
        for (const row of selectablePageRows.value) next.add(rowId(row));
    }
    emit('update:selectedIds', next);
}
function resetSelection(): void {
    emit('update:selectedIds', new Set());
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

// Same breakpoint MvTable/MvAppTopbar/MvAppMobileNav already standardize on (max-width: 800px) —
// see MvAdvancedMobileCardList.vue's own doc comment for why this is a separate render path
// rather than a toggle within the existing PrimeVue markup.
const isMobile = useIsMobileViewport(800);
</script>

<template>
    <div class="mv-advanced-data-table">
        <div class="mv-advanced-data-table__toolbar">
            <!-- Selection replaces search/filters/view-chips entirely while anything is selected
                 (Vendure-dashboard-style bulk bar) — real feedback: the count + bulk actions +
                 Reset selection is what matters at that point, not the filter UI underneath it. -->
            <div v-if="selectable && selectedIds.size > 0" class="mv-advanced-data-table__toolbar-start">
                <span class="mv-advanced-data-table__selection-count">{{ selectedIds.size }} selected</span>
                <slot name="selection-actions" :selected-ids="selectedIds" :count="selectedIds.size" />
                <MvButton size="sm" variant="ghost" @click="resetSelection">✕ Reset selection</MvButton>
            </div>
            <div v-else class="mv-advanced-data-table__toolbar-start">
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
                <!-- Column reorder/resize/hide has no equivalent in a card layout — there's no
                     header row for a toggle menu to describe, and every field either shows on
                     the card (per its `mobile` hint) or doesn't. Desktop-only. -->
                <MvColumnToggle
                    v-if="!isMobile"
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

        <!-- Per-column filters (the thing these chips summarize) have no UI at all on mobile —
             see MvAdvancedMobileCardList.vue's own doc comment — so there's nothing for this to
             ever show there. Desktop-only, same reasoning as MvColumnToggle above. Also hidden
             while selection is active, same reasoning as the toolbar swap above. -->
        <MvActiveFilterChips
            v-if="!isMobile && !(selectable && selectedIds.size > 0)"
            :chips="activeFilterChips"
            @remove="onRemoveFilterChip"
            @clear-all="clearFilters"
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
            <template v-for="col in visibleColumns" :key="col.field" #[`cell-${col.field}`]="slotProps">
                <slot :name="`cell-${col.field}`" v-bind="slotProps">{{ defaultCellText(col.field, (slotProps.data as Record<string, unknown>)[col.field]) }}</slot>
            </template>
        </MvAdvancedMobileCardList>

        <div v-else ref="tableWrapper" class="mv-advanced-data-table__scroll-host">
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
                filter-display="menu"
                v-model:filters="columnFilters"
                row-hover
                class="mv-advanced-data-table__grid"
                @page="onPage"
                @column-resize-end="onColumnResizeEnd"
                @row-click="onRowClick"
            >
                <template #empty>
                    <slot name="empty">{{ emptyMessage }}</slot>
                </template>
                <Column v-if="selectable" field="__select" :style="{ width: '48px' }">
                    <template #header>
                        <MvCheckbox
                            :model-value="headerCheckboxState.checked"
                            :indeterminate="headerCheckboxState.indeterminate"
                            :disabled="selectablePageRows.length === 0"
                            @update:model-value="toggleSelectAllOnPage"
                        />
                    </template>
                    <template #body="{ data }">
                        <MvCheckbox
                            :model-value="isRowSelected(data as TRow)"
                            :disabled="!rowSelectable(data as TRow)"
                            @update:model-value="toggleRowSelected(data as TRow)"
                        />
                    </template>
                </Column>
                <Column
                    v-for="col in visibleColumns"
                    :key="col.field"
                    :field="col.field"
                    :style="columnStyle(col)"
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
                    </template>

                    <template #body="{ data }">
                        <slot :name="`cell-${col.field}`" :data="data">
                            <span
                                class="mv-advanced-data-table__cell-text"
                                :title="defaultCellText(col.field, (data as Record<string, unknown>)[col.field])"
                                >{{ defaultCellText(col.field, (data as Record<string, unknown>)[col.field]) }}</span
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

.mv-advanced-data-table__selection-count {
    font-weight: 600;
    color: var(--el-text-color-primary, #17212b);
    white-space: nowrap;
}

.mv-advanced-data-table__btn-icon {
    width: 15px;
    height: 15px;
}

.mv-advanced-data-table__grid {
    width: 100%;
}

/* PrimeVue's default `table-layout: auto` treats a column's declared `width` as a hint, not a
   cap — the browser still grows a column past it to fit unbroken cell content (a long legal
   name), squeezing every column after it off-screen. `fixed` makes `width` authoritative; the
   default text cell (see `mv-advanced-data-table__cell-text` below) truncates with ellipsis
   instead. Real incident this fixes: the Activation table's long counterparty names pushed
   Manager/Branch/Phone/Official email columns out of view entirely. */
:deep(.mv-advanced-data-table__grid table) {
    table-layout: fixed;
}

.mv-advanced-data-table__cell-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
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
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
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
