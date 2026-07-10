<script setup lang="ts">
import { computed, h } from 'vue';
import { useRouter } from 'vue-router';
import type { Column } from 'element-plus';
import { MvTable, MvStatusBadge, MvButton } from '@mivend/ui-kit';
import type { TableRow } from '@mivend/ui-kit';
import type { OrderListItem, ManagerOption } from '../../api/orders';

const props = defineProps<{
    orders: OrderListItem[];
    managers: ManagerOption[];
    showManagerColumn: boolean;
    pendingApprovalOrderIds: Set<string>;
}>();
const router = useRouter();

const ORDER_STATE_LABEL: Record<string, string> = {
    AddingItems: 'Draft (storefront cart)',
    Draft: 'Draft (order entry)',
    ArrangingPayment: 'Arranging payment',
    PaymentAuthorized: 'Processing',
    PaymentSettled: 'Awaiting shipment',
    PartiallyShipped: 'Partially shipped',
    Shipped: 'Shipped',
    PartiallyDelivered: 'Partially delivered',
    Delivered: 'Delivered',
    Cancelled: 'Cancelled',
};

function managerName(id: string | null | undefined): string {
    if (!id) return '—';
    return props.managers.find(m => m.id === id)?.name ?? '—';
}

const columns = computed<Column<TableRow>[]>(() => {
    const cols: Column<TableRow>[] = [
        { key: 'code', title: 'Order #', dataKey: 'code', width: 160 },
        { key: 'customer', title: 'Customer', dataKey: 'customer', width: 200 },
    ];
    if (props.showManagerColumn) {
        cols.push({ key: 'manager', title: 'Manager', dataKey: 'manager', width: 140 });
    }
    cols.push(
        {
            key: 'state',
            title: 'Status',
            dataKey: 'state',
            width: 160,
            cellRenderer: ({ cellData }) => h(MvStatusBadge, {}, () => cellData as unknown as string),
        },
        { key: 'total', title: 'Total amount', dataKey: 'total', width: 130, align: 'right' },
        { key: 'date', title: 'Date placed', dataKey: 'date', width: 140 },
        { key: 'attention', title: 'Attention', dataKey: 'attention', width: 180 },
        {
            key: 'action',
            title: '',
            dataKey: 'action',
            width: 100,
            cellRenderer: ({ rowData }) =>
                h(
                    MvButton,
                    {
                        size: 'sm',
                        onClick: () => router.push(`/orders/${(rowData as TableRow).code as string}`),
                    },
                    () => 'Open',
                ),
        },
    );
    return cols;
});

const rows = computed<TableRow[]>(() =>
    props.orders.map(order => {
        const isOverdue = order.state === 'PaymentSettled';
        const isWaitingApproval = props.pendingApprovalOrderIds.has(order.id);
        return {
            code: order.code,
            customer: order.customer?.counterparty?.shortName ?? '—',
            manager: managerName(order.customer?.counterparty?.assignedManagerId),
            state: ORDER_STATE_LABEL[order.state] ?? order.state,
            total: new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: order.currencyCode,
            }).format(order.totalWithTax / 100),
            date: order.orderPlacedAt ? new Date(order.orderPlacedAt).toLocaleDateString('en-US') : '—',
            attention: isWaitingApproval ? 'Price limit exceeded' : isOverdue ? 'Shipment overdue' : '',
        };
    }),
);
</script>

<template>
    <MvTable :columns="columns" :data="rows" :height="Math.max(rows.length, 1) * 52 + 40" empty-text="No orders match your filters" />
</template>
