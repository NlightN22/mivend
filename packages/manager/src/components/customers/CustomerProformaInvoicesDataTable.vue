<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
    MvStatusBadge,
    MvAdvancedDataTable,
    MvDateTimeCell,
    useDataTableState,
    formatDocumentNumber,
    type AdvancedDataTableColumn,
    type AdvancedDataTableRowClickPayload,
    type StatusBadgeVariant,
} from '@mivend/ui-kit';
import {
    PROFORMA_INVOICE_STATUS_OPTIONS,
    PROFORMA_INVOICE_STATUS_BADGE_VARIANT,
    type ProformaInvoiceListItem,
} from '../../api/proforma-invoices';

// Second real consumer of @mivend/ui-kit's MvAdvancedDataTable (the standard table for the
// manager portal — see CustomerOrdersDataTable.vue, the first one, for the fuller feature set).
// Renders both desktop and MvAdvancedDataTable's own built-in mobile card view (see
// MvAdvancedMobileCardList.vue) — CustomerProformaInvoicesTab.vue no longer needs its own isMobile branch.
//
// The base/required column (`number`, "ProformaInvoice #") gets both a toolbar search box and its own
// funnel filter, same as Orders' `code` column — per the manager-portal-rules skill, every
// table's toolbar search defaults to the base column, backed by a real server-side filter
// (`ProformaInvoiceListOptions.search`, a substring match against ProformaInvoice.number — this proforma invoice's own
// generated business number, distinct from the order's own `code`, see that column's own doc
// comment in plugin-acquiring). `amount`/`order` still have no filter: the backend genuinely
// doesn't support filtering by either yet, and adding filter UI with nothing behind it would
// mislead a user into thinking it does something.
// No `sortField` on any column — there's no server-side sort at all for proforma invoices.
const props = defineProps<{
    proformaInvoices: ProformaInvoiceListItem[];
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

const router = useRouter();

const ALL_COLUMNS: AdvancedDataTableColumn[] = [
    {
        field: 'number',
        header: 'Proforma invoice #',
        width: 180,
        required: true,
        filterConfig: { type: 'text', placeholder: 'Proforma invoice number contains…' },
        mobile: { primary: true },
    },
    { field: 'createdAt', header: 'Date created', width: 140, filterConfig: { type: 'none' } },
    {
        field: 'status',
        header: 'Status',
        width: 140,
        filterConfig: {
            type: 'status',
            placeholder: 'All statuses',
            options: PROFORMA_INVOICE_STATUS_OPTIONS.filter(o => o.value).map(o => ({
                value: o.value,
                label: o.label,
                variant: PROFORMA_INVOICE_STATUS_BADGE_VARIANT[o.value] ?? 'neutral',
            })),
        },
        mobile: { badge: true },
    },
    { field: 'amount', header: 'Amount', width: 140, filterConfig: { type: 'none' } },
    { field: 'order', header: 'Order', width: 120, filterConfig: { type: 'none' } },
];

interface ProformaInvoiceFilterState {
    [key: string]: unknown;
    status: string;
    number: string;
}
const BLANK_FILTERS: ProformaInvoiceFilterState = { status: '', number: '' };

const { state: tableState } = useDataTableState<ProformaInvoiceFilterState>(
    `customer-proforma-invoices-datatable:${props.administratorId || 'anonymous'}`,
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
        allowedFilterKeys: ALL_COLUMNS.filter(c => c.filterConfig.type !== 'none').map(
            c => c.field,
        ),
        // `status`/`number` (search) and `pageSize` are the tab's own concern, not this table's —
        // it actually owns the fetch. Declaring them here means useDataTableState itself always
        // seeds them from the passed-in `defaults` (the tab's real current prop values), never
        // from whatever a previous session happened to persist to localStorage — see that
        // option's own doc comment for the real "page 2 shows page 3's rows" incident this
        // prevents structurally, not just by a parent-side convention that's easy to forget.
        externallyOwned: { pageSize: true, filterKeys: ['status', 'number'] },
    },
);

watch(
    () => tableState.value.filters,
    f => emit('update:filters', { status: f.status, search: f.number }),
    { deep: true },
);
watch(
    () => tableState.value.pageSize,
    size => emit('update:page-size', size),
);

// Ongoing sync only (the *initial* value is already guaranteed correct by `externallyOwned`
// above) — the tab's own statusFilter/searchFilter/pageSize can still change later (e.g. the
// view-chip bar, or the tab's own URL-synced state), and `tableState` must keep following them.
watch(
    () => props.statusFilter,
    v => {
        tableState.value.filters = { ...tableState.value.filters, status: v };
    },
);
watch(
    () => props.searchFilter,
    v => {
        tableState.value.filters = { ...tableState.value.filters, number: v };
    },
);
watch(
    () => props.pageSize,
    v => {
        tableState.value.pageSize = v;
    },
);

function money(item: { amount: number; currencyCode: string }): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: item.currencyCode,
    }).format(item.amount / 100);
}

interface ProformaInvoiceRow {
    [key: string]: unknown;
    id: string;
    number: string;
    createdAt: string;
    status: string;
    statusVariant: StatusBadgeVariant;
    amount: string;
    orderCode: string;
}
const rows = computed<ProformaInvoiceRow[]>(() =>
    props.proformaInvoices.map(proformaInvoice => ({
        id: proformaInvoice.id,
        number: proformaInvoice.number,
        createdAt: proformaInvoice.createdAt,
        status: proformaInvoice.status,
        statusVariant: PROFORMA_INVOICE_STATUS_BADGE_VARIANT[proformaInvoice.status] ?? 'neutral',
        amount: money(proformaInvoice),
        orderCode: proformaInvoice.order.code,
    })),
);

// No dedicated proforma-invoice-detail page exists yet — clicking a row goes to the underlying order,
// same as ProformaInvoicesTable.vue's existing (non-compact) behavior.
function onRowClick(event: AdvancedDataTableRowClickPayload<ProformaInvoiceRow>): void {
    router.push(`/orders/${event.row.orderCode}`);
}
</script>

<template>
    <!-- row/header height measured directly against the rendered table (all cells here are
         plain text/badge, no progress bar like Orders' fulfillment column) — see
         usePagedScrollHeight's own doc comment for why a guessed value here is unsafe. -->
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
        :search="{ filterKey: 'number', placeholder: 'Search proforma invoices…' }"
        empty-message="No proforma invoices match your filters"
        @update:page="p => emit('update:page', p)"
        @reset-page="emit('update:page', 1)"
        @row-click="onRowClick"
    >
        <template #toolbar-start>
            <slot name="view-chips" />
        </template>

        <template #cell-createdAt="{ data }">
            <MvDateTimeCell :value="(data as ProformaInvoiceRow).createdAt" />
        </template>
        <template #cell-status="{ data }">
            <MvStatusBadge :variant="(data as ProformaInvoiceRow).statusVariant">{{
                (data as ProformaInvoiceRow).status
            }}</MvStatusBadge>
        </template>
        <template #cell-number="{ data }">{{
            formatDocumentNumber((data as ProformaInvoiceRow).number)
        }}</template>
        <template #cell-order="{ data }">{{
            formatDocumentNumber((data as ProformaInvoiceRow).orderCode)
        }}</template>
    </MvAdvancedDataTable>
</template>
