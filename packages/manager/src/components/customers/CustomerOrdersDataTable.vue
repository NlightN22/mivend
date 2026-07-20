<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
    MvStatusBadge,
    MvColumnFilterStatus,
    MvAdvancedDataTable,
    useDataTableState,
    type AdvancedDataTableColumn,
    type AdvancedDataTableRowClickPayload,
    type StatusBadgeVariant,
    type StatusFilterConfig,
    type AmountRangeFilterValue,
    type DateRangeFilterValue,
    type DataTableSortMeta,
} from '@mivend/ui-kit';
import type { TableRow } from '@mivend/ui-kit';
import {
    ORDER_STATE_OPTIONS,
    ORDER_STATE_BADGE_VARIANT,
    ORDER_RESERVATION_STATE_OPTIONS,
    ORDER_RESERVATION_STATE_BADGE_VARIANT,
    FULFILLMENT_STATE_OPTIONS,
    FULFILLMENT_STATE_BADGE_VARIANT,
    type OrderSortField,
    type ManagerOption,
} from '../../api/orders';
import { PLACED_BY_CUSTOMER_VALUE, type CustomerOrdersView } from '../../api/customers';

// Desktop-only table for the customer detail Orders tab, built on @mivend/ui-kit's
// MvAdvancedDataTable — the standard desktop table for the manager portal (AGENTS.md). Mobile
// keeps CustomerOrdersTab.vue's own MvTable-based card rendering (see its `isMobile` branch). Row
// shaping (fulfillment/payment/placedBy labels) stays in CustomerOrdersTab.vue so it's computed
// once and shared between both branches, not duplicated here.
//
// Everything genuinely generic (column toggle/reorder/resize, per-column filter dispatch, active
// filter chips, stable scroll height, horizontal scroll-fade, saved-state normalization) lives in
// the shell now — this component only keeps what's Orders-specific: the column list itself, live
// data splices (currency code, manager options), the state/fulfillment/reservationState/payment
// cell renderers, the `payment` column's `custom` filter (the one sanctioned escape hatch — it's
// wired to `paymentView`, a purpose-built server-side subquery via AdminOrderPaymentViewResolver,
// not the generic OrderFilterParameter route), sort-field mapping to Vendure's OrderSortField, and
// currency minor/major unit conversion.
const props = defineProps<{
    rows: TableRow[];
    loading: boolean;
    totalItems: number;
    pageSize: number;
    managers: ManagerOption[];
    stateFilter: string[];
    reservationStateFilter: string;
    dateRangeFilter: DateRangeFilterValue;
    codeFilter: string;
    fulfillmentStateFilter: string[];
    placedByFilter: string;
    totalMinFilter: number | undefined;
    totalMaxFilter: number | undefined;
    administratorId: string;
    // The same view the chips above the table set (all/unpaid/partial/cancelled) — kept in sync
    // here so clicking a chip is reflected in the Payment column's own funnel filter too, not
    // just the other way around.
    paymentViewProp: CustomerOrdersView;
}>();

interface FilterValues {
    state: string[];
    reservationState: string;
    dateRange: DateRangeFilterValue;
    code: string;
    fulfillmentState: string[];
    placedByAdministratorId: string;
    totalMin: number | undefined;
    totalMax: number | undefined;
}

const emit = defineEmits<{
    'update:sort': [sort: Partial<Record<OrderSortField, 'ASC' | 'DESC'>>];
    'update:filters': [filters: FilterValues];
    'update:page': [page: number];
    'update:page-size': [size: number];
    'update:payment-view': [view: CustomerOrdersView];
}>();

const router = useRouter();

const NON_BLANK_STATE_OPTIONS = ORDER_STATE_OPTIONS.filter(o => o.value);
const NON_BLANK_RESERVATION_OPTIONS = ORDER_RESERVATION_STATE_OPTIONS.filter(o => o.value);

const ALL_COLUMNS: AdvancedDataTableColumn[] = [
    {
        field: 'code',
        header: 'Order #',
        sortField: 'code',
        width: 170,
        required: true,
        filterConfig: { type: 'text', placeholder: 'Order number contains…' },
    },
    {
        field: 'state',
        header: 'Commercial state',
        sortField: 'state',
        width: 160,
        filterConfig: {
            type: 'status',
            multiple: true,
            placeholder: 'All commercial states',
            options: NON_BLANK_STATE_OPTIONS.map(o => ({ ...o, variant: ORDER_STATE_BADGE_VARIANT[o.value] ?? 'neutral' })),
        },
    },
    {
        field: 'fulfillment',
        header: 'Fulfillment',
        width: 160,
        filterConfig: {
            type: 'status',
            multiple: true,
            placeholder: 'All fulfillment states',
            options: FULFILLMENT_STATE_OPTIONS.map(o => ({ ...o, variant: FULFILLMENT_STATE_BADGE_VARIANT[o.value] ?? 'neutral' })),
        },
    },
    { field: 'payment', header: 'Payment', width: 130, filterConfig: { type: 'custom' } },
    { field: 'items', header: 'Items', width: 90, filterConfig: { type: 'none' } },
    {
        field: 'total',
        header: 'Total',
        sortField: 'totalWithTax',
        width: 130,
        // currencyCode is a placeholder here — the real value is spliced in per-render by
        // resolvedColumns below, since ALL_COLUMNS itself is a plain, non-reactive array (seeded
        // once into useDataTableState's defaults).
        filterConfig: { type: 'amount-range', currencyCode: 'USD' },
    },
    {
        field: 'date',
        header: 'Date created',
        sortField: 'createdAt',
        width: 140,
        filterConfig: { type: 'date-range' },
    },
    {
        field: 'placedBy',
        header: 'Placed by',
        width: 170,
        // options placeholder — real list (from props.managers) spliced in by resolvedColumns.
        filterConfig: { type: 'enum', placeholder: 'Anyone', options: [] },
    },
    {
        field: 'reservationState',
        header: 'Reservation',
        width: 160,
        filterConfig: {
            type: 'status',
            placeholder: 'Any reservation state',
            options: NON_BLANK_RESERVATION_OPTIONS.map(o => ({ ...o, variant: ORDER_RESERVATION_STATE_BADGE_VARIANT[o.value] ?? 'neutral' })),
        },
    },
];

const currencyCode = computed(() => (props.rows[0]?.currencyCode as string | undefined) ?? 'USD');
// A customer can place their own order directly via the storefront (see the "Ivan Petrov
// (customer)" rows placedByLabel() produces) — the manager list alone can't express that value,
// same gap Fulfillment's 'Not started' fills for a null customField. PLACED_BY_CUSTOMER_VALUE is
// the shared sentinel both this options list and fetchOrdersPageForCustomer's `isNull` mapping
// agree on (see api/customers.ts).
const placedByOptions = computed(() => [
    { value: PLACED_BY_CUSTOMER_VALUE, label: 'Customer (self)' },
    ...props.managers.map(m => ({ value: m.id, label: m.name })),
]);

// Splices in the two bits of config that depend on live data (currency, manager list) rather than
// static declaration — see ALL_COLUMNS' doc comments on the 'total'/'placedBy' entries above. The
// shell receives this resolved, reactive array directly as its `columns` prop instead of a
// per-column resolver callback.
const resolvedColumns = computed<AdvancedDataTableColumn[]>(() =>
    ALL_COLUMNS.map(col => {
        if (col.field === 'total' && col.filterConfig.type === 'amount-range') {
            return { ...col, filterConfig: { ...col.filterConfig, currencyCode: currencyCode.value } };
        }
        if (col.field === 'placedBy' && col.filterConfig.type === 'enum') {
            return { ...col, filterConfig: { ...col.filterConfig, options: placedByOptions.value } };
        }
        return col;
    }),
);

// Colors match how these same states already render elsewhere: the body cell's own payment
// badge (Unpaid=neutral, Partially paid=warning — see CustomerOrdersTab.vue's
// PAYMENT_BADGE_VARIANT) and Cancelled's order-state badge (danger — see ORDER_STATE_BADGE_VARIANT
// in api/orders.ts).
const PAYMENT_FILTER_CONFIG: StatusFilterConfig = {
    type: 'status',
    placeholder: 'Search payment view…',
    options: [
        { value: 'unpaid', label: 'Unpaid', variant: 'neutral' },
        { value: 'partial', label: 'Partially paid', variant: 'warning' },
        { value: 'cancelled', label: 'Cancelled', variant: 'danger' },
    ],
};

function toMinorUnits(value: number | undefined): number | undefined {
    return value === undefined ? undefined : Math.round(value * 100);
}
function toMajorUnits(value: number | undefined): number | undefined {
    return value === undefined ? undefined : value / 100;
}

// The normalized filter state — every field's committed value, independent of whichever UI widget
// edits it. Restored/saved/reset through useDataTableState, same as column order/width/
// visibility/sort/pageSize.
interface CustomerOrdersFilterState {
    [key: string]: unknown;
    code: string;
    state: string[];
    fulfillment: string[];
    date: DateRangeFilterValue;
    placedBy: string;
    reservationState: string;
    total: AmountRangeFilterValue;
}
const DEFAULT_FILTERS: CustomerOrdersFilterState = {
    code: props.codeFilter,
    state: props.stateFilter,
    fulfillment: props.fulfillmentStateFilter,
    date: props.dateRangeFilter,
    placedBy: props.placedByFilter,
    reservationState: props.reservationStateFilter,
    total: { mode: 'range', min: toMajorUnits(props.totalMinFilter), max: toMajorUnits(props.totalMaxFilter) },
};
// Distinct from DEFAULT_FILTERS above: this is what "Clear filters" resets to (a genuinely blank
// slate), not whatever the page happened to load with — the two were conflated before this
// component had a real Clear-filters concept.
const BLANK_FILTERS: CustomerOrdersFilterState = {
    code: '',
    state: [],
    fulfillment: [],
    date: { preset: '', from: '', to: '' },
    placedBy: '',
    reservationState: '',
    total: { mode: 'range', min: undefined, max: undefined },
};

const { state: tableState } = useDataTableState<CustomerOrdersFilterState>(
    `customer-orders-datatable-v2:${props.administratorId || 'anonymous'}`,
    {
        columnOrder: ALL_COLUMNS.map(c => c.field),
        columnWidths: Object.fromEntries(ALL_COLUMNS.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: [{ field: 'date', order: -1 as const }],
        filters: DEFAULT_FILTERS,
        pageSize: props.pageSize,
    },
    {
        columns: ALL_COLUMNS,
        allowedFilterKeys: ALL_COLUMNS.filter(c => c.filterConfig.type !== 'none').map(c => c.field),
        // `pageSize` is the tab's own concern, not this table's — see that option's own doc
        // comment (useDataTableState.ts) for the real incident this prevents structurally: a
        // stale persisted pageSize from an earlier session silently disagreeing with what the
        // tab is actually fetching, from the moment this component mounts.
        externallyOwned: { pageSize: true },
    },
);

// The server request is built purely from this normalized state, never from any UI component's
// own internal state (AGENTS.md) — amount-range's min/max here are already mode-resolved
// gte/lte-ready bounds (MvColumnFilterAmountRange does that math on Apply), so this is just a
// straight field-by-field mapping plus the minor-currency-unit conversion.
function emitCurrentFilters(): void {
    const f = tableState.value.filters;
    emit('update:filters', {
        state: f.state,
        reservationState: f.reservationState,
        dateRange: f.date,
        code: f.code,
        fulfillmentState: f.fulfillment,
        placedByAdministratorId: f.placedBy,
        totalMin: toMinorUnits(f.total.min),
        totalMax: toMinorUnits(f.total.max),
    });
}
// Restores a filter set persisted from a previous session into the parent's fetch — otherwise the
// parent's own filter refs stay at their fresh-mount defaults until the user touches a filter
// again, silently ignoring whatever was restored here.
onMounted(() => emitCurrentFilters());
watch(() => tableState.value.filters, emitCurrentFilters, { deep: true });

function sortToVendure(meta: DataTableSortMeta[]): Partial<Record<OrderSortField, 'ASC' | 'DESC'>> {
    const result: Partial<Record<OrderSortField, 'ASC' | 'DESC'>> = {};
    for (const m of meta) {
        const col = ALL_COLUMNS.find(c => c.field === m.field);
        if (col?.sortField) result[col.sortField as OrderSortField] = m.order === 1 ? 'ASC' : 'DESC';
    }
    return Object.keys(result).length ? result : { createdAt: 'DESC' };
}
watch(() => tableState.value.sort, meta => emit('update:sort', sortToVendure(meta)), { deep: true });

// Payment is wired to the same paymentView the chips above the table use — a separate prop/emit,
// not part of the generic OrderFilterParameter filters, and the one sanctioned `custom` filter
// type (it doesn't fit any standard pattern).
const paymentView = ref<CustomerOrdersView | ''>(props.paymentViewProp === 'all' ? '' : props.paymentViewProp);
watch(
    () => props.paymentViewProp,
    value => {
        paymentView.value = value === 'all' ? '' : value;
    },
);
function onPaymentViewChange(value: CustomerOrdersView | ''): void {
    paymentView.value = value;
    emit('update:payment-view', (value || 'all') as CustomerOrdersView);
}
function onClearFilters(): void {
    paymentView.value = '';
    emit('update:payment-view', 'all');
}

function onPage(page: number): void {
    emit('update:page', page);
}
function onResetPage(): void {
    emit('update:page', 1);
}
watch(() => tableState.value.pageSize, size => emit('update:page-size', size));
// Ongoing sync only — the *initial* value is already guaranteed correct by `externallyOwned`
// above (see useDataTableState.ts's own doc comment).
watch(() => props.pageSize, v => {
    tableState.value.pageSize = v;
});

function onRowClick(event: AdvancedDataTableRowClickPayload<TableRow>): void {
    router.push(`/orders/${event.row.code as string}`);
}
</script>

<template>
    <MvAdvancedDataTable
        v-model:table-state="tableState"
        :columns="resolvedColumns"
        :rows="rows"
        :loading="loading"
        :total-items="totalItems"
        data-key="code"
        :row-height-px="61"
        :header-height-px="65"
        :search="{ filterKey: 'code', placeholder: 'Search orders…' }"
        :default-filters="BLANK_FILTERS"
        empty-message="No orders yet"
        @update:page="onPage"
        @reset-page="onResetPage"
        @clear-filters="onClearFilters"
        @row-click="onRowClick"
    >
        <template #toolbar-start>
            <!-- Each table defines its own quick-filter chips (e.g. All/Unpaid/Partially paid/
                 Cancelled — see CustomerOrdersTab.vue) — this is just the reserved slot for them,
                 empty by default. -->
            <slot name="view-chips" />
        </template>

        <template #cell-state="{ data }">
            <MvStatusBadge :variant="(data as TableRow).stateVariant as StatusBadgeVariant">{{ (data as TableRow).state }}</MvStatusBadge>
        </template>

        <template #cell-fulfillment="{ data }">
            <div class="customer-orders-data-table__fulfillment">
                <MvStatusBadge :variant="(data as TableRow).fulfillmentVariant as StatusBadgeVariant">
                    {{ (data as TableRow).fulfillment }}
                </MvStatusBadge>
                <div class="customer-orders-data-table__progress-track">
                    <span
                        class="customer-orders-data-table__progress-fill"
                        :style="{ width: `${(data as TableRow).fulfillmentProgress as number}%` }"
                    />
                </div>
            </div>
        </template>

        <template #cell-reservationState="{ data }">
            <MvStatusBadge :variant="(data as TableRow).reservationVariant as StatusBadgeVariant">{{ (data as TableRow).reservation }}</MvStatusBadge>
        </template>

        <template #cell-payment="{ data }">
            <MvStatusBadge :variant="(data as TableRow).paymentVariant as StatusBadgeVariant">{{ (data as TableRow).payment }}</MvStatusBadge>
        </template>

        <!-- The one sanctioned `custom` filter (see ALL_COLUMNS' 'payment' entry) — reuses the
             same colored-badge checklist every other status-shaped filter uses
             (MvColumnFilterStatus) instead of a plain unstyled native <select> — single-select
             here since the backend paymentView only ever takes one value. -->
        <template #filter-payment>
            <MvColumnFilterStatus
                :config="PAYMENT_FILTER_CONFIG"
                :model-value="paymentView"
                @update:model-value="onPaymentViewChange($event as CustomerOrdersView | '')"
            />
        </template>
    </MvAdvancedDataTable>
</template>

<style scoped>
.customer-orders-data-table__fulfillment {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.customer-orders-data-table__progress-track {
    width: 108px;
    height: 6px;
    background: var(--el-fill-color-light, #edf1f4);
    border-radius: 999px;
    overflow: hidden;
}

.customer-orders-data-table__progress-fill {
    display: block;
    height: 100%;
    background: var(--el-color-primary, #00b894);
}
</style>
