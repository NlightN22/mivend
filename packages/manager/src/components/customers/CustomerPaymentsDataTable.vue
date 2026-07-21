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
    PAYMENT_STATUS_OPTIONS,
    PAYMENT_STATUS_BADGE_VARIANT,
    PAYMENT_CHANNEL_OPTIONS,
    type PaymentListItem,
} from '../../api/payments';

// Third consumer of @mivend/ui-kit's MvAdvancedDataTable, following CustomerInvoicesDataTable.vue's
// shape. Renders both desktop and MvAdvancedDataTable's own built-in mobile card view (see
// MvAdvancedMobileCardList.vue) — CustomerPaymentsTab.vue no longer needs its own isMobile branch.
//
// The base/required column (`number`, "Payment #") gets both a toolbar search box and its own
// funnel filter — backed by a real server-side filter (`PaymentListOptions.search`, a substring
// match against PaymentAttempt.number, this project's own internally-generated business number,
// same principle as Order.code/Invoice.number/DiscountGrant.number). Deliberately NOT
// providerPaymentId (the payment's real external reference — acquirer RRN, kassa receipt, ERP
// payment-doc id) — per AGENTS.md rule #13 the two serve different purposes and must stay
// separate fields; providerPaymentId is fetched (PaymentListItem.providerPaymentId) for a future
// reconciliation-facing column but isn't shown here yet. `amount`/`invoice` still have no filter:
// the backend genuinely doesn't support filtering by either yet.
const props = defineProps<{
    payments: PaymentListItem[];
    loading: boolean;
    totalItems: number;
    page: number;
    pageSize: number;
    statusFilter: string;
    channelFilter: string;
    searchFilter: string;
    administratorId: string;
}>();

const emit = defineEmits<{
    'update:filters': [filters: { status: string; channel: string; search: string }];
    'update:page': [page: number];
    'update:page-size': [size: number];
}>();

const ALL_COLUMNS: AdvancedDataTableColumn[] = [
    {
        field: 'number',
        header: 'Payment #',
        width: 190,
        required: true,
        filterConfig: { type: 'text', placeholder: 'Payment number contains…' },
        mobile: { primary: true },
    },
    { field: 'createdAt', header: 'Date created', width: 140, filterConfig: { type: 'none' } },
    {
        field: 'channel',
        header: 'Source',
        width: 160,
        filterConfig: {
            type: 'select',
            placeholder: 'All sources',
            options: PAYMENT_CHANNEL_OPTIONS.filter(o => o.value).map(o => ({ value: o.value, label: o.label })),
        },
    },
    {
        field: 'status',
        header: 'Status',
        width: 140,
        filterConfig: {
            type: 'status',
            placeholder: 'All statuses',
            options: PAYMENT_STATUS_OPTIONS.filter(o => o.value).map(o => ({
                value: o.value,
                label: o.label,
                variant: PAYMENT_STATUS_BADGE_VARIANT[o.value] ?? 'neutral',
            })),
        },
        mobile: { badge: true },
    },
    { field: 'amount', header: 'Amount', width: 140, filterConfig: { type: 'none' } },
    { field: 'invoice', header: 'Invoice', width: 120, filterConfig: { type: 'none' } },
];

interface PaymentFilterState {
    [key: string]: unknown;
    status: string;
    channel: string;
    number: string;
}
const BLANK_FILTERS: PaymentFilterState = { status: '', channel: '', number: '' };

const { state: tableState } = useDataTableState<PaymentFilterState>(
    `customer-payments-datatable:${props.administratorId || 'anonymous'}`,
    {
        columnOrder: ALL_COLUMNS.map(c => c.field),
        columnWidths: Object.fromEntries(ALL_COLUMNS.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: [],
        filters: { status: props.statusFilter, channel: props.channelFilter, number: props.searchFilter },
        pageSize: props.pageSize,
    },
    {
        columns: ALL_COLUMNS,
        allowedFilterKeys: ALL_COLUMNS.filter(c => c.filterConfig.type !== 'none').map(c => c.field),
        // Same reasoning as CustomerInvoicesDataTable.vue: status/channel/number(search)/pageSize
        // are the tab's own concern (it owns the fetch) — always seed from the tab's current prop
        // values, never from stale localStorage.
        externallyOwned: { pageSize: true, filterKeys: ['status', 'channel', 'number'] },
    },
);

watch(
    () => tableState.value.filters,
    f => emit('update:filters', { status: f.status, channel: f.channel, search: f.number }),
    { deep: true },
);
watch(() => tableState.value.pageSize, size => emit('update:page-size', size));

watch(() => props.statusFilter, v => {
    tableState.value.filters = { ...tableState.value.filters, status: v };
});
watch(() => props.channelFilter, v => {
    tableState.value.filters = { ...tableState.value.filters, channel: v };
});
watch(() => props.searchFilter, v => {
    tableState.value.filters = { ...tableState.value.filters, number: v };
});
watch(() => props.pageSize, v => {
    tableState.value.pageSize = v;
});

const CHANNEL_LABEL: Record<string, string> = Object.fromEntries(
    PAYMENT_CHANNEL_OPTIONS.filter(o => o.value).map(o => [o.value, o.label]),
);

function money(item: { amount: number; currencyCode: string }): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: item.currencyCode }).format(item.amount / 100);
}

interface PaymentRow {
    [key: string]: unknown;
    id: string;
    number: string;
    createdAt: string;
    channel: string;
    status: string;
    statusVariant: StatusBadgeVariant;
    amount: string;
    invoice: string;
}
const rows = computed<PaymentRow[]>(() =>
    props.payments.map(payment => ({
        id: payment.id,
        number: payment.number,
        createdAt: payment.createdAt,
        channel: CHANNEL_LABEL[payment.channel] ?? payment.channel,
        status: payment.paymentStatus,
        statusVariant: PAYMENT_STATUS_BADGE_VARIANT[payment.paymentStatus] ?? 'neutral',
        amount: money(payment),
        invoice: payment.invoiceId ?? '—',
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
        :search="{ filterKey: 'number', placeholder: 'Search payments…' }"
        empty-message="No payments match your filters"
        @update:page="p => emit('update:page', p)"
        @reset-page="emit('update:page', 1)"
    >
        <template #toolbar-start>
            <!-- Reserved slot for CustomerPaymentsTab.vue's quick-filter view chips — same shape
                 as CustomerOrdersDataTable.vue/CustomerInvoicesDataTable.vue. -->
            <slot name="view-chips" />
        </template>

        <template #cell-createdAt="{ data }">
            <MvDateTimeCell :value="(data as PaymentRow).createdAt" />
        </template>
        <template #cell-status="{ data }">
            <MvStatusBadge :variant="(data as PaymentRow).statusVariant">{{ (data as PaymentRow).status }}</MvStatusBadge>
        </template>
    </MvAdvancedDataTable>
</template>
