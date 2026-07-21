<script setup lang="ts">
import { computed, watch } from 'vue';
import {
    MvStatusBadge,
    MvAdvancedDataTable,
    MvDateTimeCell,
    useDataTableState,
    type AdvancedDataTableColumn,
    type StatusBadgeVariant,
} from '@mivend/ui-kit';
import {
    DISCOUNT_GRANT_STATUS_OPTIONS,
    DISCOUNT_GRANT_STATUS_BADGE_VARIANT,
    type DiscountRuleItem,
} from '../../api/customers';

// Fourth consumer of @mivend/ui-kit's MvAdvancedDataTable, same shape as
// CustomerPaymentsDataTable.vue — see manager-table-standard skill for the checklist this
// follows: `number` (Discount #) is the identifying/required column, backed by a real toolbar
// search + funnel filter (DiscountGrantForCustomerListOptions.search, a substring match against
// DiscountGrant.number — generated at creation, see that column's own doc comment); `status` is a
// real status filter backed by DiscountGrantService.computeGrantStatus (server-side, not
// re-derived client-side). `scope`/`percent`/`validTo` have no filter — the backend doesn't
// support filtering by any of them yet, and none of the three are a natural search target the
// way `number` or `status` are.
const props = defineProps<{
    discounts: DiscountRuleItem[];
    loading: boolean;
    totalItems: number;
    page: number;
    pageSize: number;
    statusFilter: string;
    searchFilter: string;
    administratorId: string;
}>();

const emit = defineEmits<{
    'update:filters': [filters: { status: string; search: string }];
    'update:page': [page: number];
    'update:page-size': [size: number];
}>();

const ALL_COLUMNS: AdvancedDataTableColumn[] = [
    {
        field: 'number',
        header: 'Discount #',
        width: 190,
        required: true,
        filterConfig: { type: 'text', placeholder: 'Discount number contains…' },
        mobile: { primary: true },
    },
    { field: 'createdAt', header: 'Date created', width: 140, filterConfig: { type: 'none' } },
    { field: 'scope', header: 'Applies to', width: 200, filterConfig: { type: 'none' } },
    { field: 'percent', header: 'Discount', width: 100, filterConfig: { type: 'none' } },
    { field: 'validTo', header: 'Valid until', width: 130, filterConfig: { type: 'none' } },
    {
        field: 'status',
        header: 'Status',
        width: 140,
        filterConfig: {
            type: 'status',
            placeholder: 'All statuses',
            options: DISCOUNT_GRANT_STATUS_OPTIONS.filter(o => o.value).map(o => ({
                value: o.value,
                label: o.label,
                variant: DISCOUNT_GRANT_STATUS_BADGE_VARIANT[o.value as keyof typeof DISCOUNT_GRANT_STATUS_BADGE_VARIANT],
            })),
        },
        mobile: { badge: true },
    },
];

interface DiscountFilterState {
    [key: string]: unknown;
    status: string;
    number: string;
}
const BLANK_FILTERS: DiscountFilterState = { status: '', number: '' };

const { state: tableState } = useDataTableState<DiscountFilterState>(
    `customer-discounts-datatable:${props.administratorId || 'anonymous'}`,
    {
        columnOrder: ALL_COLUMNS.map(c => c.field),
        columnWidths: Object.fromEntries(ALL_COLUMNS.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: [],
        filters: { status: props.statusFilter, number: props.searchFilter },
        pageSize: props.pageSize,
    },
    {
        columns: ALL_COLUMNS,
        allowedFilterKeys: ALL_COLUMNS.filter(c => c.filterConfig.type !== 'none').map(c => c.field),
        // status/number(search)/pageSize are the tab's own concern (it owns the fetch) — always
        // seed from the tab's current prop values, never from stale localStorage (see
        // CustomerPaymentsDataTable.vue's identical reasoning).
        externallyOwned: { pageSize: true, filterKeys: ['status', 'number'] },
    },
);

watch(
    () => tableState.value.filters,
    f => emit('update:filters', { status: f.status, search: f.number }),
    { deep: true },
);
watch(() => tableState.value.pageSize, size => emit('update:page-size', size));

watch(() => props.statusFilter, v => {
    tableState.value.filters = { ...tableState.value.filters, status: v };
});
watch(() => props.searchFilter, v => {
    tableState.value.filters = { ...tableState.value.filters, number: v };
});
watch(() => props.pageSize, v => {
    tableState.value.pageSize = v;
});

interface DiscountRow {
    [key: string]: unknown;
    id: string;
    number: string;
    createdAt: string;
    scope: string;
    percent: string;
    validTo: string;
    status: string;
    statusVariant: StatusBadgeVariant;
}
const rows = computed<DiscountRow[]>(() =>
    props.discounts.map(discount => ({
        id: discount.id,
        number: discount.number,
        createdAt: discount.createdAt,
        scope: discount.facetValueCode ?? 'All products',
        percent: `${discount.percent}%`,
        validTo: new Date(discount.validTo).toLocaleDateString('en-US'),
        status: DISCOUNT_GRANT_STATUS_OPTIONS.find(o => o.value === discount.status)?.label ?? discount.status,
        statusVariant: DISCOUNT_GRANT_STATUS_BADGE_VARIANT[discount.status],
    })),
);
</script>

<template>
    <MvAdvancedDataTable
        v-model:table-state="tableState"
        :columns="ALL_COLUMNS"
        :rows="rows"
        :loading="loading"
        :total-items="totalItems"
        :page="page"
        data-key="id"
        :row-height-px="49"
        :header-height-px="65"
        :default-filters="BLANK_FILTERS"
        :search="{ filterKey: 'number', placeholder: 'Search discounts…' }"
        empty-message="No discounts apply to this customer"
        @update:page="p => emit('update:page', p)"
        @reset-page="emit('update:page', 1)"
    >
        <template #toolbar-start>
            <!-- Reserved slot for CustomerDiscountsTab.vue's quick-filter view chips — same shape
                 as CustomerOrdersDataTable.vue/CustomerInvoicesDataTable.vue. -->
            <slot name="view-chips" />
        </template>
        <template #toolbar-end>
            <slot name="toolbar-end" />
        </template>

        <template #cell-createdAt="{ data }">
            <MvDateTimeCell :value="(data as DiscountRow).createdAt" />
        </template>
        <template #cell-status="{ data }">
            <MvStatusBadge :variant="(data as DiscountRow).statusVariant">{{ (data as DiscountRow).status }}</MvStatusBadge>
        </template>
    </MvAdvancedDataTable>
</template>
