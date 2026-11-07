<script setup lang="ts">
import { computed, watch } from 'vue';
import {
    MvStatusBadge,
    MvAdvancedDataTable,
    MvDateTimeCell,
    useDataTableState,
    formatDocumentNumber,
    type AdvancedDataTableColumn,
    type AdvancedDataTableRowClickPayload,
} from '@mivend/ui-kit';
import { useCurrency } from '../../composables/useCurrency';
import {
    ORDER_STATE_OPTIONS,
    ORDER_STATE_BADGE_VARIANT,
    ORDER_RESERVATION_STATE_OPTIONS,
    ORDER_RESERVATION_STATE_BADGE_VARIANT,
    type ManagerOption,
} from '../../api/orders';
import { PLACED_BY_CUSTOMER_VALUE } from '../../api/customers';
import type { OrdersListFilters, OrdersView } from '../../api/orders-list';
import type { OrdersSort } from '../../composables/ordersListUrl';
import type { OrderListRow } from './ordersListRows';
import {
    BLANK_TABLE_FILTERS,
    listFiltersToTable,
    sortFromState,
    sortToState,
    tableFiltersToList,
    type OrdersTableFilters,
} from './ordersTableFilters';

const props = defineProps<{
    rows: OrderListRow[];
    loading: boolean;
    totalItems: number;
    page: number;
    pageSize: number;
    filters: OrdersListFilters;
    sort: OrdersSort;
    managers: ManagerOption[];
    administratorId: string;
    showManagerColumn: boolean;
    // A fixed customer: its own column is redundant, and the filter is never offered.
    customerPreset: boolean;
}>();

const emit = defineEmits<{
    'update:filters': [filters: OrdersListFilters];
    'update:sort': [sort: OrdersSort];
    'update:page': [page: number];
    'update:page-size': [size: number];
    'clear-filters': [];
    'row-click': [row: OrderListRow];
}>();

const NON_BLANK_STATES = ORDER_STATE_OPTIONS.filter(o => o.value);
const NON_BLANK_RESERVATIONS = ORDER_RESERVATION_STATE_OPTIONS.filter(o => o.value);

const ALL_COLUMNS: AdvancedDataTableColumn[] = [
    {
        field: 'code',
        header: 'Order #',
        sortField: 'code',
        width: 170,
        required: true,
        filterConfig: { type: 'text', placeholder: 'Order, company, INN or phone contains…' },
        mobile: { primary: true },
    },
    {
        field: 'date',
        header: 'Date created',
        sortField: 'createdAt',
        width: 140,
        filterConfig: { type: 'date-range' },
    },
    // customer, branch and attention have no server-side filter; the search box covers the customer.
    { field: 'customer', header: 'Customer', width: 230, filterConfig: { type: 'none' } },
    {
        field: 'manager',
        header: 'Manager',
        width: 150,
        filterConfig: { type: 'enum', placeholder: 'Any manager', options: [] },
    },
    {
        field: 'state',
        header: 'Status',
        sortField: 'state',
        width: 230,
        filterConfig: {
            type: 'status',
            multiple: true,
            placeholder: 'All statuses',
            options: NON_BLANK_STATES.map(o => ({
                ...o,
                variant: ORDER_STATE_BADGE_VARIANT[o.value] ?? 'neutral',
            })),
        },
        mobile: { badge: true },
    },
    {
        field: 'total',
        header: 'Total',
        sortField: 'totalWithTax',
        width: 130,
        filterConfig: { type: 'amount-range', currencyCode: '' },
    },
    {
        field: 'placedBy',
        header: 'Placed by',
        width: 170,
        filterConfig: { type: 'enum', placeholder: 'Anyone', options: [] },
        mobile: { hidden: true },
    },
    {
        field: 'reservationState',
        header: 'Reservation',
        width: 160,
        filterConfig: {
            type: 'status',
            placeholder: 'Any reservation state',
            options: NON_BLANK_RESERVATIONS.map(o => ({
                ...o,
                variant: ORDER_RESERVATION_STATE_BADGE_VARIANT[o.value] ?? 'neutral',
            })),
        },
        mobile: { hidden: true },
    },
    {
        field: 'branch',
        header: 'Branch',
        width: 140,
        filterConfig: { type: 'none' },
        mobile: { hidden: true },
    },
    {
        field: 'attention',
        header: 'Attention',
        width: 170,
        filterConfig: { type: 'none' },
        mobile: { hidden: true },
    },
];

const { currencyCode: channelCurrency } = useCurrency();
const currencyCode = computed(() => props.rows[0]?.currencyCode ?? channelCurrency.value ?? '');

const managerOptions = computed(() => props.managers.map(m => ({ value: m.id, label: m.name })));
const placedByOptions = computed(() => [
    { value: PLACED_BY_CUSTOMER_VALUE, label: 'Customer (self)' },
    ...managerOptions.value,
]);

const resolvedColumns = computed<AdvancedDataTableColumn[]>(() =>
    ALL_COLUMNS.filter(
        c =>
            !(c.field === 'customer' && props.customerPreset) &&
            !(c.field === 'manager' && !props.showManagerColumn),
    ).map(col => {
        const config = col.filterConfig;
        if (col.field === 'total' && config.type === 'amount-range')
            return { ...col, filterConfig: { ...config, currencyCode: currencyCode.value } };
        if (col.field === 'manager' && config.type === 'enum')
            return { ...col, filterConfig: { ...config, options: managerOptions.value } };
        if (col.field === 'placedBy' && config.type === 'enum')
            return { ...col, filterConfig: { ...config, options: placedByOptions.value } };
        return col;
    }),
);

const { state: tableState } = useDataTableState<OrdersTableFilters>(
    `orders-list-v1:${props.customerPreset ? 'customer:' : ''}${props.administratorId}`,
    {
        columnOrder: ALL_COLUMNS.map(c => c.field),
        columnWidths: Object.fromEntries(ALL_COLUMNS.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: sortToState(props.sort, ALL_COLUMNS),
        filters: listFiltersToTable(props.filters),
        pageSize: props.pageSize,
    },
    {
        columns: ALL_COLUMNS,
        allowedFilterKeys: [],
        // Filters, sort and page size come from the URL, never from a previous session.
        externallyOwned: { pageSize: true, filterKeys: Object.keys(BLANK_TABLE_FILTERS) },
    },
);
tableState.value.sort = sortToState(props.sort, ALL_COLUMNS);

// The chips own `view`; the table never emits it, the parent merges it back in.
function currentView(): OrdersView {
    return props.filters.view;
}
watch(
    () => tableState.value.filters,
    f => emit('update:filters', tableFiltersToList(f, currentView())),
    { deep: true },
);
watch(
    () => tableState.value.sort,
    s => emit('update:sort', sortFromState(s, ALL_COLUMNS)),
    { deep: true },
);
watch(
    () => tableState.value.pageSize,
    size => emit('update:page-size', size),
);
watch(
    () => props.pageSize,
    size => {
        tableState.value.pageSize = size;
    },
);
watch(
    () => props.filters,
    f => {
        const next = listFiltersToTable(f);
        if (JSON.stringify(next) !== JSON.stringify(tableState.value.filters))
            tableState.value.filters = next;
    },
);

function onRowClick(event: AdvancedDataTableRowClickPayload<OrderListRow>): void {
    emit('row-click', event.row);
}
</script>

<template>
    <MvAdvancedDataTable
        v-model:table-state="tableState"
        :columns="resolvedColumns"
        :rows="rows"
        :loading="loading"
        :total-items="totalItems"
        :page="page"
        data-key="code"
        :row-height-px="61"
        :header-height-px="65"
        :search="{ filterKey: 'code', placeholder: 'Search orders…' }"
        :default-filters="BLANK_TABLE_FILTERS"
        empty-message="No orders match your filters"
        @update:page="emit('update:page', $event)"
        @reset-page="emit('update:page', 1)"
        @clear-filters="emit('clear-filters')"
        @row-click="onRowClick"
    >
        <template #toolbar-start>
            <slot name="view-chips" />
        </template>

        <template #cell-code="{ data }">{{
            formatDocumentNumber((data as OrderListRow).code)
        }}</template>

        <template #cell-date="{ data }">
            <MvDateTimeCell :value="(data as OrderListRow).createdAt" />
        </template>

        <template #cell-customer="{ data }">
            <div class="orders-list-table__customer">
                <span class="orders-list-table__customer-name">{{
                    (data as OrderListRow).customer
                }}</span>
                <span class="orders-list-table__customer-meta">{{
                    (data as OrderListRow).customerMeta
                }}</span>
            </div>
        </template>

        <template #cell-state="{ data }">
            <div class="orders-list-table__badges">
                <MvStatusBadge :variant="(data as OrderListRow).stateVariant">{{
                    (data as OrderListRow).state
                }}</MvStatusBadge>
                <MvStatusBadge
                    v-for="flag in (data as OrderListRow).flags"
                    :key="flag.label"
                    :variant="flag.variant"
                    >{{ flag.label }}</MvStatusBadge
                >
            </div>
        </template>

        <template #cell-reservationState="{ data }">
            <MvStatusBadge :variant="(data as OrderListRow).reservationVariant">{{
                (data as OrderListRow).reservation
            }}</MvStatusBadge>
        </template>
    </MvAdvancedDataTable>
</template>

<style scoped>
.orders-list-table__customer {
    display: flex;
    flex-direction: column;
    gap: 2px;
    line-height: 1.3;
}

.orders-list-table__customer-name {
    font-weight: 700;
}

.orders-list-table__customer-meta {
    font-size: 12px;
    color: var(--app-text-grey);
}

.orders-list-table__badges {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}
</style>
