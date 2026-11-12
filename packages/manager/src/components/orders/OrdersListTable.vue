<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import {
    MvStatusBadge,
    MvAdvancedDataTable,
    MvDateTimeCell,
    MvErrorState,
    useDataTableState,
    formatDocumentNumber,
    type AdvancedDataTableColumn,
    type AdvancedDataTableRowClickPayload,
} from '@mivend/ui-kit';
import type { ManagerOption } from '../../api/orders';
import { ALL_COLUMNS, DEFAULT_HIDDEN_COLUMNS } from './ordersColumns';
import { PLACED_BY_CUSTOMER_VALUE } from '../../api/customers';
import { restoreOrdersFilters, type OrdersListFilters } from '../../api/orders-list';
import { ORDERS_URL_DEFAULTS, type OrdersSort } from '../../composables/ordersListUrl';
import type { TableViewState } from '../../composables/tableViewState';
import { usePriceTypeNames } from '../../composables/usePriceTypeNames';
import { customerMetaText } from './orderCustomerMeta';
import TableViewsMenu from '../TableViewsMenu.vue';
import type { OrderListRow } from './ordersListRows';
import {
    BLANK_TABLE_FILTERS,
    sortFromState,
    sortToState,
    type OrdersTableFilters,
} from './ordersTableFilters';

const props = defineProps<{
    rows: OrderListRow[];
    loading: boolean;
    failed: boolean;
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
    urlPrefix?: string;
}>();

const emit = defineEmits<{
    'update:filters': [filters: OrdersListFilters];
    'update:sort': [sort: OrdersSort];
    'update:page': [page: number];
    'update:page-size': [size: number];
    'clear-filters': [];
    retry: [];
}>();

const { t } = useI18n();
const priceTypes = usePriceTypeNames();
onMounted(() => void priceTypes.load());

const managerOptions = computed(() => props.managers.map(m => ({ value: m.id, label: m.name })));
const placedByOptions = computed(() => [
    { value: PLACED_BY_CUSTOMER_VALUE, label: t('orders.list.customerSelf') },
    ...managerOptions.value,
]);

const resolvedColumns = computed<AdvancedDataTableColumn[]>(() =>
    ALL_COLUMNS.filter(
        c =>
            !(c.field === 'customer' && props.customerPreset) &&
            !(c.field === 'manager' && !props.showManagerColumn),
    ).map(col => {
        if (col.field === 'manager') return { ...col, filterOptions: managerOptions.value };
        if (col.field === 'placedBy') return { ...col, filterOptions: placedByOptions.value };
        return col;
    }),
);

const { state: tableState } = useDataTableState<OrdersTableFilters>(
    `orders-list-v4:${props.customerPreset ? 'customer:' : ''}${props.administratorId}`,
    {
        columnOrder: ALL_COLUMNS.map(c => c.field),
        columnWidths: Object.fromEntries(ALL_COLUMNS.map(c => [c.field, c.width])),
        hiddenColumns: DEFAULT_HIDDEN_COLUMNS,
        sort: sortToState(props.sort, ALL_COLUMNS),
        filters: { code: props.filters.search },
        pageSize: props.pageSize,
    },
    {
        columns: ALL_COLUMNS,
        allowedFilterKeys: [],
        // Search, filters, sort and page size come from the URL, never from a previous session.
        externallyOwned: { pageSize: true, filterKeys: Object.keys(BLANK_TABLE_FILTERS) },
    },
);
tableState.value.sort = sortToState(props.sort, ALL_COLUMNS);

// The chips own `view`; the table never emits it, the parent merges it back in.
watch(
    () => tableState.value.filters.code,
    search => {
        if (search !== props.filters.search) emit('update:filters', { ...props.filters, search });
    },
);
function onConditions(conditions: OrdersListFilters['conditions']): void {
    emit('update:filters', { ...props.filters, conditions });
}
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
    () => props.filters.search,
    search => {
        if (search !== tableState.value.filters.code) tableState.value.filters.code = search;
    },
);

const viewsKey = props.customerPreset ? 'customer-orders' : 'orders';
const openedWithLink = Object.keys(ORDERS_URL_DEFAULTS).some(
    k => (props.urlPrefix ?? '') + k in useRoute().query,
);

function captureView(): TableViewState {
    return {
        filters: {
            search: props.filters.search,
            view: props.filters.view,
            conditions: props.filters.conditions,
        },
        sort: { ...props.sort },
        columnOrder: [...tableState.value.columnOrder],
        hiddenColumns: [...tableState.value.hiddenColumns],
    };
}

function applyView(state: TableViewState): void {
    const fields = ALL_COLUMNS.map(c => c.field);
    const order = state.columnOrder.filter(f => fields.includes(f));
    tableState.value.columnOrder = [...order, ...fields.filter(f => !order.includes(f))];
    tableState.value.hiddenColumns = state.hiddenColumns.filter(
        f => fields.includes(f) && !ALL_COLUMNS.find(c => c.field === f)?.required,
    );
    const sort = sortToState(
        { field: state.sort.field as OrdersSort['field'], dir: state.sort.dir },
        ALL_COLUMNS,
    );
    tableState.value.sort = sort;
    emit('update:sort', sortFromState(sort, ALL_COLUMNS));
    emit('update:filters', restoreOrdersFilters(state.filters));
}

const flagLabels = (row: OrderListRow): string => row.flags.map(flag => flag.label).join(', ');

const router = useRouter();
function onRowClick(event: AdvancedDataTableRowClickPayload<OrderListRow>): void {
    const target = event.originalEvent.target;
    if (target instanceof Element && target.closest('a, button')) return;
    const href = router.resolve(`/orders/${event.row.code}`).href;
    const mouse = event.originalEvent as MouseEvent;
    if (mouse.ctrlKey || mouse.metaKey) window.open(href, '_blank', 'noopener');
    else void router.push(href);
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
        :row-height-px="64"
        :header-height-px="65"
        :search="{ filterKey: 'code', placeholder: t('orders.list.search') }"
        :conditions="filters.conditions"
        :default-filters="BLANK_TABLE_FILTERS"
        :empty-message="t('orders.list.empty')"
        @update:conditions="onConditions"
        @update:page="emit('update:page', $event)"
        @reset-page="emit('update:page', 1)"
        @clear-filters="emit('clear-filters')"
        @row-click="onRowClick"
    >
        <template #empty>
            <MvErrorState
                v-if="failed"
                :title="t('orders.list.loadFailedTitle')"
                :message="t('orders.list.loadFailedMessage')"
                @retry="emit('retry')"
            />
            <template v-else>{{ loading ? '' : t('orders.list.empty') }}</template>
        </template>

        <template #toolbar-start>
            <slot name="view-chips" />
        </template>

        <template #toolbar-end>
            <TableViewsMenu
                :views-key="viewsKey"
                :owner-key="administratorId"
                :capture="captureView"
                :apply="applyView"
                :skip-restore="() => openedWithLink"
            />
        </template>

        <template #cell-code="{ data }">
            <RouterLink
                class="mv-cell-id mv-cell-link"
                :to="`/orders/${(data as OrderListRow).code}`"
                >{{ formatDocumentNumber((data as OrderListRow).code) }}</RouterLink
            >
        </template>

        <template #cell-date="{ data }">
            <MvDateTimeCell :value="(data as OrderListRow).createdAt" />
        </template>

        <template #cell-customer="{ data }">
            <div class="orders-list-table__customer">
                <span class="mv-cell-primary" :title="(data as OrderListRow).customer">{{
                    (data as OrderListRow).customer
                }}</span>
                <span
                    v-if="customerMetaText(data as OrderListRow, priceTypes.names.value)"
                    class="mv-cell-meta"
                    >{{ customerMetaText(data as OrderListRow, priceTypes.names.value) }}</span
                >
            </div>
        </template>

        <template #cell-manager="{ data }">
            <span class="mv-cell-primary" :title="(data as OrderListRow).manager">{{
                (data as OrderListRow).manager
            }}</span>
        </template>

        <template #cell-state="{ data }">
            <div class="orders-list-table__badges">
                <MvStatusBadge
                    clamp
                    :title="(data as OrderListRow).state"
                    :variant="(data as OrderListRow).stateVariant"
                    >{{ (data as OrderListRow).state }}</MvStatusBadge
                >
                <span
                    v-if="(data as OrderListRow).flags.length"
                    class="mv-cell-more"
                    role="note"
                    :aria-label="t('orders.list.also', { flags: flagLabels(data as OrderListRow) })"
                    :title="flagLabels(data as OrderListRow)"
                    >+{{ (data as OrderListRow).flags.length }}</span
                >
            </div>
        </template>

        <template #cell-placedBy="{ data }">
            <div class="orders-list-table__customer">
                <span class="mv-cell-primary">{{ (data as OrderListRow).placedBy }}</span>
                <span class="mv-cell-meta">{{ (data as OrderListRow).placedByMeta }}</span>
            </div>
        </template>

        <template #cell-reservationState="{ data }">
            <MvStatusBadge :variant="(data as OrderListRow).reservationVariant">{{
                (data as OrderListRow).reservation
            }}</MvStatusBadge>
        </template>
    </MvAdvancedDataTable>
</template>

<style scoped src="./OrdersListTable.css"></style>
