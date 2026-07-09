<script setup lang="ts">
import { computed, h } from 'vue';
import { useRouter } from 'vue-router';
import type { Column } from 'element-plus';
import { MvTable, MvStatusBadge } from '@mivend/ui-kit';
import type { TableRow } from '@mivend/ui-kit';
import type { RecentOrder } from '../../api/dashboard';

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
        cellRenderer: ({ cellData }) => h(MvStatusBadge, {}, () => cellData as unknown as string),
    },
    { key: 'total', title: 'Total', dataKey: 'total', width: 120, align: 'right' },
    { key: 'date', title: 'Date', dataKey: 'date', width: 120 },
];

const rows = computed<TableRow[]>(() =>
    props.orders.map(order => ({
        code: order.code,
        customer: order.customer ? `${order.customer.firstName} ${order.customer.lastName}` : '—',
        state: order.state,
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
