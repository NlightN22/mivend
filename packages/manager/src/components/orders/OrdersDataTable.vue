<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import DataTable, { type DataTableSortMeta as PrimeSortMeta, type DataTableFilterMeta } from 'primevue/datatable';
import Column from 'primevue/column';
import Popover from 'primevue/popover';
import MultiSelect from 'primevue/multiselect';
import Select from 'primevue/select';
import { Grid, RefreshRight } from '@element-plus/icons-vue';
import { MvStatusBadge, MvButton, useDataTableState, type StatusBadgeVariant } from '@mivend/ui-kit';
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
            date: order.orderPlacedAt ? new Date(order.orderPlacedAt).toLocaleDateString('en-US') : '—',
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
        { field: 'date', header: 'Date placed', sortField: 'orderPlacedAt', width: 140 },
        { field: 'branch', header: 'Branch', width: 140 },
        { field: 'attention', header: 'Attention', width: 180 },
    );
    return cols;
});

// Persisted per admin, per table — column order/width/visibility/sort/pageSize (AGENTS.md
// "personal display preference, not business data" — same reasoning as useColumnVisibility,
// just the richer PrimeVue-shaped version, see useDataTableState's own doc comment).
const { state: tableState, reset: resetTableState } = useDataTableState(
    `orders-datatable:${props.administratorId || 'anonymous'}`,
    {
        columnOrder: ALL_COLUMNS.value.map(c => c.field),
        columnWidths: Object.fromEntries(ALL_COLUMNS.value.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: [{ field: 'orderPlacedAt', order: -1 }],
        filters: {},
        pageSize: props.pageSize,
    },
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
    // PrimeVue doesn't hand back the field name directly on resize — read it off the header
    // cell's own text content as a pragmatic fallback since there's no documented stable field
    // accessor on this event.
    const headerText = event.element?.querySelector('.p-datatable-column-title')?.textContent?.trim();
    const col = ALL_COLUMNS.value.find(c => c.header === headerText);
    if (!col) return;
    const current = tableState.value.columnWidths[col.field] ?? col.width;
    tableState.value.columnWidths = { ...tableState.value.columnWidths, [col.field]: current + event.delta };
    void field;
}

function sortFieldToVendure(meta: PrimeSortMeta[] | null | undefined): Partial<Record<OrderSortField, 'ASC' | 'DESC'>> {
    const result: Partial<Record<OrderSortField, 'ASC' | 'DESC'>> = {};
    for (const m of meta ?? []) {
        const col = ALL_COLUMNS.value.find(c => c.field === m.field);
        if (col?.sortField) result[col.sortField] = m.order === 1 ? 'ASC' : 'DESC';
    }
    return Object.keys(result).length ? result : { orderPlacedAt: 'DESC' };
}

const multiSortMeta = ref<PrimeSortMeta[]>(
    tableState.value.sort.map(s => ({ field: s.field, order: s.order })),
);
function onSort(event: { multiSortMeta?: PrimeSortMeta[] }): void {
    const meta = event.multiSortMeta ?? [];
    multiSortMeta.value = meta;
    tableState.value.sort = meta.map(m => ({ field: String(m.field ?? ''), order: (m.order ?? -1) as 1 | -1 }));
    emit('update:sort', sortFieldToVendure(meta));
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

function resetLayout(): void {
    resetTableState();
    multiSortMeta.value = [{ field: 'date', order: -1 }];
    emit('update:sort', { orderPlacedAt: 'DESC' });
}

// See CustomerOrdersDataTable.vue's identical helper doc comment: PrimeVue's sort trigger is
// bound to the whole sortable <th>, not just its sort icon, so any click on the title or empty
// header space resorted the table. This blocks that in the capture phase, before PrimeVue's own
// bubble-phase handler sees it, unless the click actually landed on the sort icon.
function onHeaderClickCapture(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('[data-pc-section="columnheadercontent"]')) return;
    const isSortIcon = !!target.closest('[data-pc-section="sorticon"]');
    if (!isSortIcon) {
        event.stopPropagation();
    }
}
</script>

<template>
    <div class="orders-data-table" @click.capture="onHeaderClickCapture">
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
            :value="rows"
            :loading="loading"
            data-key="code"
            lazy
            scrollable
            :scroll-height="dynamicScrollHeight"
            resizable-columns
            column-resize-mode="expand"
            reorderable-columns
            sort-mode="multiple"
            :multi-sort-meta="multiSortMeta"
            filter-display="row"
            :filters="filters"
            row-hover
            class="orders-data-table__grid"
            @sort="onSort"
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
                :header="col.header"
                :sortable="!!col.sortField"
                :style="{ width: col.width + 'px' }"
            >
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

/* Bigger + pushed away from the title, matching CustomerOrdersDataTable.vue's own sort-icon
   sizing next to its filter funnel — a tiny icon flush against the title text was easy to miss
   and easy to fat-finger past onto the (now non-sorting) title itself. Hover feedback (light
   green) moves from the whole header cell (see the sortable-column rule below — PrimeVue's
   default whole-header hover now points at an area that does nothing on click) down to just this
   icon, matching CustomerOrdersDataTable.vue's identical treatment. */
:deep(.p-datatable-sort-icon) {
    width: 18px;
    height: 18px;
    margin-inline-start: 8px;
    padding: 2px;
    border-radius: 6px;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s;
}

/* Scoped to `:not(.p-datatable-column-sorted)` — see CustomerOrdersDataTable.vue's identical
   rule/comment. Without this exclusion, `!important` here would force the currently-sorted
   column's own permanently-highlighted icon to this hover green instead while the mouse is over
   it — a smaller version of the same "the active-sort highlight disappears on hover" glitch the
   `th` rule below also had before this fix. */
:deep(.p-datatable-sortable-column:not(.p-datatable-column-sorted) .p-datatable-sort-icon:hover) {
    background: var(--el-color-primary-light-9, #e6faf4) !important;
    color: var(--el-color-primary, #00b894) !important;
}

/* See CustomerOrdersDataTable.vue's identical rule/comment: PrimeVue's own hover selector
   (`.p-datatable-sortable-column:not(.p-datatable-column-sorted):hover`) is more specific than a
   plain `:hover` override, so `!important` is needed to actually beat it. Scoped with the same
   `:not(.p-datatable-column-sorted)` PrimeVue's own rule has — omitting it (an earlier version of
   this file did) means hovering the *currently sorted* column's `th` wipes out its permanent
   selected-column highlight for as long as the mouse stays there, reappearing on mouse-out — a
   visible flicker bug, not just a style preference. */
:deep(.p-datatable-sortable-column:not(.p-datatable-column-sorted):hover) {
    background: transparent !important;
    color: inherit !important;
}

/* PrimeVue's base stylesheet sets `cursor: pointer` on the whole `th`
   (`.p-datatable-sortable-column { cursor: pointer; ... }`), not just the title — overriding only
   `.p-datatable-column-title` left the surrounding empty header background still showing a
   pointer/hand cursor, looking clickable even though only the sort icon does anything now. */
:deep(.p-datatable-sortable-column) {
    cursor: default;
}

:deep(.p-datatable-column-title) {
    cursor: default;
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
