<script setup lang="ts">
import { computed, h } from 'vue';
import { useRouter } from 'vue-router';
import type { Column } from 'element-plus';
import { MvTable, MvStatusBadge } from '@mivend/ui-kit';
import type { TableRow } from '@mivend/ui-kit';
import type { InvoiceListItem } from '../../api/invoices';

const props = defineProps<{
    invoices: InvoiceListItem[];
    counterpartyNames: Map<string, string>;
    // Nested customer-tab usage hides the Customer column (redundant — the whole tab is already
    // scoped to one customer) and disables row-click navigation (no standalone invoice detail
    // page exists yet).
    compact?: boolean;
    // See OrdersTable.vue's identical doc comment — keeps table height stable across page
    // changes so a shorter last page doesn't shrink total page height and snap scroll to top.
    pageSize?: number;
}>();
const router = useRouter();

function money(item: InvoiceListItem): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: item.currencyCode }).format(
        item.amount / 100,
    );
}

const columns = computed<Column<TableRow>[]>(() => {
    const cols: Column<TableRow>[] = [
        { key: 'id', title: 'Invoice #', dataKey: 'id', width: 120, mobile: { primary: true } },
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
            cellRenderer: ({ cellData }) => h(MvStatusBadge, {}, () => cellData as unknown as string),
            mobile: { badge: true },
        },
        { key: 'amount', title: 'Amount', dataKey: 'amount', width: 140, align: 'right' },
        { key: 'order', title: 'Order', dataKey: 'order', width: 120 },
    );
    return cols;
});

const rows = computed<TableRow[]>(() =>
    props.invoices.map(invoice => ({
        id: invoice.id,
        customer: props.counterpartyNames.get(invoice.counterpartyId) ?? invoice.counterpartyId,
        status: invoice.status,
        amount: money(invoice),
        order: invoice.orderId,
    })),
);

function openOrder(payload: { rowData: TableRow }): void {
    if (props.compact) return;
    router.push(`/orders/${payload.rowData.order as string}`);
}
</script>

<template>
    <MvTable
        :columns="columns"
        :data="rows"
        :height="Math.max(rows.length, props.pageSize ?? 1) * 52 + 40"
        empty-text="No invoices match your filters"
        @row-click="openOrder"
    />
</template>
