<script setup lang="ts">
import { computed, h } from 'vue';
import { useRouter } from 'vue-router';
import type { Column } from 'element-plus';
import { MvTable, MvStatusBadge, formatDocumentNumber } from '@mivend/ui-kit';
import type { TableRow, StatusBadgeVariant } from '@mivend/ui-kit';
import {
    PROFORMA_INVOICE_STATUS_BADGE_VARIANT,
    type ProformaInvoiceListItem,
} from '../../api/proforma-invoices';

const props = defineProps<{
    proformaInvoices: ProformaInvoiceListItem[];
    counterpartyNames: Map<string, string>;
    // Nested customer-tab usage hides the Customer column (redundant — the whole tab is already
    // scoped to one customer) and disables row-click navigation (no standalone proforma invoice detail
    // page exists yet).
    compact?: boolean;
    // See OrdersTable.vue's identical doc comment — keeps table height stable across page
    // changes so a shorter last page doesn't shrink total page height and snap scroll to top.
    pageSize?: number;
    // Must be threaded through to MvTable (not used to unmount this component at the page
    // level) — unmounting during a refetch collapses page height and snaps scroll to top,
    // the same bug class pageSize already guards against.
    loading?: boolean;
}>();
const router = useRouter();

function money(item: ProformaInvoiceListItem): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: item.currencyCode,
    }).format(item.amount / 100);
}

const columns = computed<Column<TableRow>[]>(() => {
    const cols: Column<TableRow>[] = [
        {
            key: 'id',
            title: 'Proforma invoice #',
            dataKey: 'id',
            width: 120,
            mobile: { primary: true },
        },
    ];
    if (!props.compact) {
        cols.push({ key: 'customer', title: 'Customer', dataKey: 'customer', width: 220 });
    }
    cols.push(
        {
            key: 'status',
            title: 'Status',
            dataKey: 'status',
            width: 140,
            cellRenderer: ({ rowData }) => {
                const row = rowData as TableRow;
                return h(
                    MvStatusBadge,
                    { variant: row.statusVariant as StatusBadgeVariant },
                    () => row.status as string,
                );
            },
            mobile: { badge: true },
        },
        { key: 'amount', title: 'Amount', dataKey: 'amount', width: 140, align: 'right' },
        { key: 'order', title: 'Order', dataKey: 'orderDisplay', width: 120 },
    );
    return cols;
});

const rows = computed<TableRow[]>(() =>
    props.proformaInvoices.map(proformaInvoice => ({
        id: proformaInvoice.id,
        customer:
            props.counterpartyNames.get(proformaInvoice.counterpartyId) ??
            proformaInvoice.counterpartyId,
        status: proformaInvoice.status,
        statusVariant: PROFORMA_INVOICE_STATUS_BADGE_VARIANT[proformaInvoice.status] ?? 'neutral',
        amount: money(proformaInvoice),
        order: proformaInvoice.order.code,
        orderDisplay: formatDocumentNumber(proformaInvoice.order.code),
    })),
);

function openOrder(payload: { rowData: TableRow }): void {
    if (props.compact) return;
    // Real incident: this used to push proforma invoice.orderId (the numeric internal Order id) into a
    // route that expects Order.code (see router's 'orders/:code') — every click landed on a
    // broken order-detail page. order.code now comes from the real ProformaInvoice.order resolve field.
    router.push(`/orders/${payload.rowData.order as string}`);
}
</script>

<template>
    <MvTable
        :columns="columns"
        :data="rows"
        :height="Math.max(rows.length, props.pageSize ?? 1) * 52 + 40"
        :loading="loading"
        empty-text="No proforma invoices match your filters"
        @row-click="openOrder"
    />
</template>
