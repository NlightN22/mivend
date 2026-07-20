<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue';
import { useRouter } from 'vue-router';
import DataTable, { type DataTableFilterMeta } from 'primevue/datatable';
import Column from 'primevue/column';
import Popover from 'primevue/popover';
import MultiSelect from 'primevue/multiselect';
import Select from 'primevue/select';
import { Grid, RefreshRight, Sort, SortUp, SortDown, Rank } from '@element-plus/icons-vue';
import {
    MvStatusBadge,
    MvButton,
    useDataTableState,
    type DataTableSortMeta,
    type StatusBadgeVariant,
} from '@mivend/ui-kit';
import {
    ORDER_STATE_LABEL,
    ORDER_STATE_BADGE_VARIANT,
    ORDER_STATE_OPTIONS,
    type OrderListItem,
    type OrderSortField,
    type ManagerOption,
    type BranchOption,
} from '../../api/orders';

// PrimeVue-based desktop replacement for the old element-plus/ElTableV2-based OrdersTable.vue —
// see AGENTS.md-adjacent session note: mobile keeps the existing MvMobileCardList (wired by
// OrdersTableResponsive.vue, the breakpoint switch), only the desktop rendering changes here.
// Sort/filter are wired to real backend support: Vendure's own OrderSortParameter/
// OrderFilterParameter already cover code/state/orderPlacedAt/totalWithTax generically (see
// api/orders.ts's fetchOrdersPage) — columns without a real server-side equivalent (Customer's
// company name, Manager's assigned-manager name, Branch, Attention) intentionally get no sort/
// filter UI here rather than a fake client-side one that would silently only affect the current
// page.
const props = defineProps<{
    orders: OrderListItem[];
    managers: ManagerOption[];
    branches: BranchOption[];
    showManagerColumn: boolean;
    pendingApprovalOrderIds: Set<string>;
    loading: boolean;
    totalItems: number;
    pageSize: number;
    stateFilter: string;
    administratorId: string;
}>();

const emit = defineEmits<{
    'update:sort': [sort: Partial<Record<OrderSortField, 'ASC' | 'DESC'>>];
    'update:state-filter': [value: string];
    'update:page-size': [value: number];
}>();

const router = useRouter();

function managerName(id: string | null | undefined): string {
    if (!id) return '—';
    return props.managers.find(m => m.id === id)?.name ?? '—';
}

function branchName(erpId: string | null | undefined): string {
    if (!erpId) return '—';
    return props.branches.find(b => b.erpId === erpId)?.name ?? '—';
}

interface OrderRow {
    code: string;
    customer: string;
    customerMeta: string;
    manager: string;
    state: string;
    stateVariant: StatusBadgeVariant;
    total: string;
    date: string;
    branch: string;
    attention: string;
}

const rows = computed<OrderRow[]>(() =>
    props.orders.map(order => {
        const isOverdue = order.state === 'PaymentSettled';
        const isWaitingApproval = props.pendingApprovalOrderIds.has(order.id);
        const counterparty = order.customer?.counterparty;
        return {
            code: order.code,
            customer: counterparty?.shortName ?? '—',
            customerMeta: counterparty ? `INN ${counterparty.inn ?? '—'} · ${counterparty.priceType}` : '',
            manager: managerName(counterparty?.assignedManagerId),
            state: ORDER_STATE_LABEL[order.state] ?? order.state,
            stateVariant: ORDER_STATE_BADGE_VARIANT[order.state] ?? 'neutral',
            total: new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: order.currencyCode,
            }).format(order.totalWithTax / 100),
            date: new Date(order.createdAt).toLocaleDateString('en-US'),
            branch: branchName(counterparty?.branchId),
            attention: isWaitingApproval ? 'Price limit exceeded' : isOverdue ? 'Shipment overdue' : '',
        };
    }),
);

interface ColumnDef {
    field: string;
    header: string;
    sortField?: OrderSortField;
    width: number;
    required?: boolean;
}

const ALL_COLUMNS = computed<ColumnDef[]>(() => {
    const cols: ColumnDef[] = [{ field: 'code', header: 'Order #', sortField: 'code', width: 160, required: true }];
    cols.push({ field: 'customer', header: 'Customer', width: 220 });
    if (props.showManagerColumn) cols.push({ field: 'manager', header: 'Manager', width: 140 });
    cols.push(
        { field: 'state', header: 'Status', sortField: 'state', width: 160 },
        { field: 'total', header: 'Total amount', sortField: 'totalWithTax', width: 140 },
        { field: 'date', header: 'Date created', sortField: 'createdAt', width: 140 },
        { field: 'branch', header: 'Branch', width: 140 },
        { field: 'attention', header: 'Attention', width: 180 },
    );
    return cols;
});

// Persisted per admin, per table — column order/width/visibility/sort/pageSize (AGENTS.md
// "personal display preference, not business data" — same reasoning as useColumnVisibility,
// just the richer PrimeVue-shaped version, see useDataTableState's own doc comment).
const { state: tableState, resetColumns: resetTableColumns } = useDataTableState(
    `orders-datatable:${props.administratorId || 'anonymous'}`,
    {
        columnOrder: ALL_COLUMNS.value.map(c => c.field),
        columnWidths: Object.fromEntries(ALL_COLUMNS.value.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: [{ field: 'createdAt', order: -1 }],
        filters: {},
        pageSize: props.pageSize,
    },
    { columns: ALL_COLUMNS.value, allowedFilterKeys: [], externallyOwned: { pageSize: true } },
);

// Reorder/resize/visibility all operate on this ordered, filtered view of ALL_COLUMNS — the
// single array PrimeVue's dynamic-columns pattern (`v-for` over `visibleColumns`) renders from.
const visibleColumns = computed<ColumnDef[]>(() => {
    const byField = new Map(ALL_COLUMNS.value.map(c => [c.field, c]));
    const hidden = new Set(tableState.value.hiddenColumns);
    return tableState.value.columnOrder
        .filter(field => byField.has(field) && (!hidden.has(field) || byField.get(field)!.required))
        .map(field => {
            const col = byField.get(field)!;
            return { ...col, width: tableState.value.columnWidths[field] ?? col.width };
        });
});

const columnsPopoverRef = ref();
function toggleColumnsPopover(e: Event): void {
    columnsPopoverRef.value?.toggle(e);
}
// Fits the table's own scroll area to exactly the selected page size instead of a fixed
// viewport-relative height — see CustomerOrdersDataTable.vue's identical fix/comment.
const ROW_HEIGHT_PX = 52;
const HEADER_HEIGHT_PX = 54;
const dynamicScrollHeight = computed(() => `${props.pageSize * ROW_HEIGHT_PX + HEADER_HEIGHT_PX}px`);

const multiSelectModel = computed<string[]>({
    get: () => ALL_COLUMNS.value.filter(c => !tableState.value.hiddenColumns.includes(c.field)).map(c => c.field),
    set: (fields: string[]) => {
        tableState.value.hiddenColumns = ALL_COLUMNS.value
            .filter(c => !c.required && !fields.includes(c.field))
            .map(c => c.field);
    },
});

function onColumnReorder(event: { dragIndex: number; dropIndex: number }): void {
    const order = [...tableState.value.columnOrder];
    const [moved] = order.splice(event.dragIndex, 1);
    order.splice(event.dropIndex, 0, moved);
    tableState.value.columnOrder = order;
}

function onColumnResizeEnd(event: { element: HTMLElement; delta: number }): void {
    const field = event.element?.dataset?.pcColumn ?? event.element?.getAttribute('data-p-index');
    // PrimeVue doesn't hand back the field name directly on resize — read it off our own header
    // title span (see the Column's `#header` template below) as a pragmatic fallback since
    // there's no documented stable field accessor on this event.
    const headerText = event.element?.querySelector('.orders-data-table__col-title')?.textContent?.trim();
    const col = ALL_COLUMNS.value.find(c => c.header === headerText);
    if (!col) return;
    const current = tableState.value.columnWidths[col.field] ?? col.width;
    tableState.value.columnWidths = { ...tableState.value.columnWidths, [col.field]: current + event.delta };
    void field;
}

function sortFieldToVendure(meta: DataTableSortMeta[]): Partial<Record<OrderSortField, 'ASC' | 'DESC'>> {
    const result: Partial<Record<OrderSortField, 'ASC' | 'DESC'>> = {};
    for (const m of meta) {
        const col = ALL_COLUMNS.value.find(c => c.field === m.field);
        if (col?.sortField) result[col.sortField] = m.order === 1 ? 'ASC' : 'DESC';
    }
    return Object.keys(result).length ? result : { createdAt: 'DESC' };
}

// Fully custom, single-column sort — deliberately NOT using PrimeVue's own `sortable`/
// `sort-mode="multiple"` machinery anymore. That approach fought the library on two fronts at
// once: (1) its click-to-sort is bound to the *whole* header `<th>`, requiring an undocumented
// capture-phase click interceptor keyed off internal `data-pc-section` attributes to restrict it
// to just the icon, and (2) recoloring the sort icon/header on hover meant `!important` overrides
// racing PrimeVue's own higher-specificity internal rules. Both were real, shipped bugs (clicking
// the title still sorted; hovering an already-sorted column's highlight made it flicker/vanish),
// and this round of trying to patch case #2 without breaking case #1 broke sorting outright. A
// plain button we render and wire ourselves has no such internal contract to fight — this is also
// simpler for users: a single active sort column with a directional arrow, no multi-sort priority
// badge to explain.
function toggleSort(col: ColumnDef): void {
    if (!col.sortField) return;
    const current = tableState.value.sort[0];
    const next: DataTableSortMeta =
        current?.field === col.field ? { field: col.field, order: current.order === 1 ? -1 : 1 } : { field: col.field, order: 1 };
    tableState.value.sort = [next];
    emit('update:sort', sortFieldToVendure([next]));
}

function sortIconFor(col: ColumnDef): Component {
    const active = tableState.value.sort[0];
    if (active?.field !== col.field) return Sort;
    return active.order === 1 ? SortUp : SortDown;
}

// PrimeVue's own header mousedown handler (bound directly on each sortable/reorderable `th`) arms
// a native HTML5 column-drag on ANY mousedown there that isn't an <input>/<textarea>/the resize
// handle — nothing in that check knows about our own custom sort button or reorder handle, so
// without this, dragging the title, the sort button, or genuinely empty header space all start a
// column drag too (confirmed live — an earlier version tried covering the "empty space" case with
// a flex-growing spacer element instead, but that visually dragged the sort/reorder icons away
// from the title as the column got wider, which looked broken in its own way).
// This delegated listener is registered on the wrapper (bubble phase, ordinary Vue template
// binding — not `.capture`), so by DOM bubble order it always runs *after* the `th`'s own
// mousedown listener already ran and set `draggable`. That means this only has to *correct*
// `draggable` back to `false` when the real mousedown target isn't inside the reorder handle —
// robust regardless of column reorders/rebuilds, since it's one listener on a stable ancestor, not
// something reattached per header cell.
function onHeaderMousedown(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const th = target.closest('th');
    if (!th) return;
    const isHandle = !!target.closest('.orders-data-table__reorder-handle');
    if (!isHandle) {
        (th as HTMLElement).draggable = false;
    }
}

const filters = ref<DataTableFilterMeta>({ state: { value: props.stateFilter || null, matchMode: 'equals' } });
watch(
    () => props.stateFilter,
    value => {
        filters.value = { state: { value: value || null, matchMode: 'equals' } };
    },
);
function onFilter(): void {
    const value = (filters.value.state as { value: string | null } | undefined)?.value ?? '';
    emit('update:state-filter', value ?? '');
}
const stateFilterModel = computed<string | null>({
    get: () => (filters.value.state as { value: string | null } | undefined)?.value ?? null,
    set: (value: string | null) => {
        filters.value = { state: { value, matchMode: 'equals' } };
        onFilter();
    },
});

function onRowClick(event: { data: OrderRow }): void {
    router.push(`/orders/${event.data.code}`);
}

// See CustomerOrdersDataTable.vue's identical `tableRemountKey` doc comment: PrimeVue's own
// resizableColumns implementation injects a `!important`-based <style> element into document.head
// on every resize, which always wins over this table's own `:style="{ width: ... }"` binding and
// is never cleared except by another resize or the DataTable unmounting. Resetting
// tableState.columnWidths alone updates our own reactive binding but leaves that stylesheet's
// override in place — bumping this key forces a full remount, which runs PrimeVue's cleanup too.
const tableRemountKey = ref(0);

function resetLayout(): void {
    resetTableColumns();
    tableState.value.sort = [{ field: 'date', order: -1 }];
    emit('update:sort', { createdAt: 'DESC' });
    tableRemountKey.value++;
}
</script>

<template>
    <div class="orders-data-table" @mousedown="onHeaderMousedown">
        <div class="orders-data-table__toolbar">
            <MvButton size="sm" variant="ghost" @click="toggleColumnsPopover">
                <Grid class="orders-data-table__btn-icon" />
                Columns
            </MvButton>
            <MvButton size="sm" variant="ghost" @click="resetLayout">
                <RefreshRight class="orders-data-table__btn-icon" />
                Reset table layout
            </MvButton>
        </div>
        <Popover ref="columnsPopoverRef">
            <MultiSelect
                v-model="multiSelectModel"
                :options="ALL_COLUMNS.filter(c => !c.required)"
                option-label="header"
                option-value="field"
                placeholder="Choose columns"
                display="chip"
            />
        </Popover>

        <DataTable
            :key="tableRemountKey"
            :value="rows"
            :loading="loading"
            data-key="code"
            lazy
            scrollable
            :scroll-height="dynamicScrollHeight"
            resizable-columns
            column-resize-mode="expand"
            reorderable-columns
            filter-display="row"
            :filters="filters"
            row-hover
            class="orders-data-table__grid"
            @filter="onFilter"
            @column-reorder="onColumnReorder"
            @column-resize-end="onColumnResizeEnd"
            @row-click="onRowClick"
        >
            <template #empty>No orders match your filters</template>
            <Column
                v-for="col in visibleColumns"
                :key="col.field"
                :field="col.field"
                :style="{ width: col.width + 'px' }"
            >
                <template #header>
                    <span class="orders-data-table__col-title">{{ col.header }}</span>
                    <button
                        v-if="col.sortField"
                        type="button"
                        class="orders-data-table__sort-btn"
                        :class="{ 'orders-data-table__sort-btn--active': tableState.sort[0]?.field === col.field }"
                        @click.stop="toggleSort(col)"
                    >
                        <component :is="sortIconFor(col)" class="orders-data-table__sort-icon" />
                    </button>
                    <span class="orders-data-table__reorder-handle" title="Drag to reorder column">
                        <Rank class="orders-data-table__reorder-icon" />
                    </span>
                </template>
                <template v-if="col.field === 'customer'" #body="{ data }">
                    <div class="orders-data-table__customer-cell">
                        <span class="orders-data-table__customer-name">{{ (data as OrderRow).customer }}</span>
                        <span class="orders-data-table__customer-meta">{{ (data as OrderRow).customerMeta }}</span>
                    </div>
                </template>
                <template v-else-if="col.field === 'state'" #body="{ data }">
                    <MvStatusBadge :variant="(data as OrderRow).stateVariant">{{ (data as OrderRow).state }}</MvStatusBadge>
                </template>
                <template v-if="col.field === 'state'" #filter>
                    <Select
                        v-model="stateFilterModel"
                        :options="[...ORDER_STATE_OPTIONS]"
                        option-label="label"
                        option-value="value"
                        placeholder="All statuses"
                    />
                </template>
            </Column>
            <Column field="action" header="" :style="{ width: '110px' }">
                <template #body="{ data }">
                    <MvButton size="sm" @click.stop="router.push(`/orders/${(data as OrderRow).code}`)">Open order</MvButton>
                </template>
            </Column>
        </DataTable>
    </div>
</template>

<style scoped>
.orders-data-table__toolbar {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-bottom: 8px;
}

.orders-data-table__btn-icon {
    width: 15px;
    height: 15px;
}

.orders-data-table__grid {
    width: 100%;
}

/* Our own sort control, rendered via the Column's `#header` template — not PrimeVue's built-in
   `sortable` (see toggleSort()'s doc comment for why). A plain button we fully own means no
   fighting internal PrimeVue classes/specificity for hover or click-target sizing. */
.orders-data-table__col-title {
    cursor: default;
}

.orders-data-table__sort-btn {
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

.orders-data-table__sort-btn:hover {
    background: var(--el-color-primary-light-9, #e6faf4);
    color: var(--el-color-primary, #00b894);
}

.orders-data-table__sort-btn--active {
    color: var(--el-color-primary, #00b894);
}

.orders-data-table__sort-icon {
    width: 16px;
    height: 16px;
}

/* See onHeaderMousedown()'s doc comment for why dragging is restricted to this handle without
   a flex-growing spacer (an earlier version used one, and it visually dragged this icon away from
   the title as the column got wider). */
.orders-data-table__reorder-handle {
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

.orders-data-table__reorder-handle:hover {
    background: var(--el-color-primary-light-9, #e6faf4);
    color: var(--el-color-primary, #00b894);
}

.orders-data-table__reorder-icon {
    width: 15px;
    height: 15px;
}

/* PrimeVue's resize handle is a full-height strip at each column's trailing edge, but its default
   border is fully transparent — there's no visible affordance that a column boundary is
   draggable at all until the cursor already happens to land on it. The full-height *hit area*
   stays as-is (shrinking it would make the boundary harder to actually grab) — only the *visible*
   line is a short, centered mark via `::after`, rather than a line spanning the whole header
   cell's height edge-to-edge, which read as an oddly heavy full-height divider. */
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

.orders-data-table__customer-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
    line-height: 1.3;
}

.orders-data-table__customer-name {
    font-weight: 700;
}

.orders-data-table__customer-meta {
    font-size: 12px;
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
