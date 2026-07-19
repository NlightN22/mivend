<script setup lang="ts">
import { computed, h } from 'vue';
import { useRouter } from 'vue-router';
import type { Column } from 'element-plus';
import { MvTable, MvStatusBadge } from '@mivend/ui-kit';
import type { TableRow, StatusBadgeVariant } from '@mivend/ui-kit';
import type { RecentOrder } from '../../api/dashboard';
import { ORDER_STATE_LABEL, ORDER_STATE_BADGE_VARIANT } from '../../api/orders';

const props = defineProps<{ orders: RecentOrder[] }>();
const router = useRouter();

const columns: Column<TableRow>[] = [
    { key: 'code', title: 'Order', dataKey: 'code', width: 170 },
    { key: 'customer', title: 'Customer', dataKey: 'customer', width: 160 },
    {
        key: 'state',
        title: 'Status',
        dataKey: 'state',
        width: 170,
        cellRenderer: ({ rowData }) => {
            const row = rowData as TableRow;
            return h(MvStatusBadge, { variant: row.stateVariant as StatusBadgeVariant }, () => row.state as string);
        },
    },
    { key: 'total', title: 'Total', dataKey: 'total', width: 120, align: 'right' },
    { key: 'date', title: 'Date', dataKey: 'date', width: 120 },
];

const rows = computed<TableRow[]>(() =>
    props.orders.map(order => ({
        code: order.code,
        customer: order.customer ? `${order.customer.firstName} ${order.customer.lastName}` : '—',
        state: ORDER_STATE_LABEL[order.state] ?? order.state,
        stateVariant: ORDER_STATE_BADGE_VARIANT[order.state] ?? 'neutral',
        total: new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: order.currencyCode,
        }).format(order.totalWithTax / 100),
        date: order.orderPlacedAt ? new Date(order.orderPlacedAt).toLocaleDateString('en-US') : '—',
    })),
);

function handleRowClick({ rowData }: { rowData: TableRow }): void {
    router.push(`/orders/${rowData.code as string}`);
}
</script>

<template>
    <MvTable
        :columns="columns"
        :data="rows"
        :height="Math.max(rows.length, 1) * 52 + 40"
        empty-text="No orders yet"
        @row-click="handleRowClick"
    />
</template>
