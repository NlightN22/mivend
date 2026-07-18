<script setup lang="ts">
import { computed, h } from 'vue';
import { useRouter } from 'vue-router';
import type { Column } from 'element-plus';
import { MvTable, MvStatusBadge, MvButton } from '@mivend/ui-kit';
import type { TableRow } from '@mivend/ui-kit';
import type { OrderListItem, ManagerOption, BranchOption } from '../../api/orders';

const props = defineProps<{
    orders: OrderListItem[];
    managers: ManagerOption[];
    branches: BranchOption[];
    showManagerColumn: boolean;
    pendingApprovalOrderIds: Set<string>;
    // Keeps the table height stable across page changes — sizing it off the current page's
    // actual row count means the last (partial) page renders a much shorter table, which
    // shrinks total page height enough that the browser clamps window.scrollY to the new
    // (smaller) max, snapping the whole page to the top. See MvPagination's e2e test.
    pageSize?: number;
    hiddenColumnKeys?: Set<string>;
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

function branchName(erpId: string | null | undefined): string {
    if (!erpId) return '—';
    return props.branches.find(b => b.erpId === erpId)?.name ?? '—';
}

const columns = computed<Column<TableRow>[]>(() => {
    const cols: Column<TableRow>[] = [
        { key: 'code', title: 'Order #', dataKey: 'code', width: 160, mobile: { primary: true } },
        {
            key: 'customer',
            title: 'Customer',
            dataKey: 'customer',
            width: 200,
            cellRenderer: ({ rowData }) => {
                const row = rowData as TableRow;
                return h('div', { class: 'orders-table__customer-cell' }, [
                    h('span', { class: 'orders-table__customer-name' }, row.customer as string),
                    h('span', { class: 'orders-table__customer-meta' }, row.customerMeta as string),
                ]);
            },
        },
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
            mobile: { badge: true },
        },
        { key: 'total', title: 'Total amount', dataKey: 'total', width: 130, align: 'right' },
        { key: 'date', title: 'Date placed', dataKey: 'date', width: 140, mobile: { hidden: true } },
        { key: 'branch', title: 'Branch', dataKey: 'branch', width: 140, mobile: { hidden: true } },
        // Real signal, not decorative: derived above from actual approval-workflow/order-state
        // data (isWaitingApproval / isOverdue), not a fabricated "next action" concept.
        { key: 'attention', title: 'Attention', dataKey: 'attention', width: 180, mobile: { highlight: true } },
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
                        onClick: (e: MouseEvent) => {
                            e.stopPropagation();
                            router.push(`/orders/${(rowData as TableRow).code as string}`);
                        },
                    },
                    () => 'Open order',
                ),
            mobile: { actions: true },
        },
    );
    if (!props.hiddenColumnKeys?.size) return cols;
    return cols.filter(c => !props.hiddenColumnKeys!.has(c.key as string));
});

function openOrder(payload: { rowData: TableRow }): void {
    router.push(`/orders/${payload.rowData.code as string}`);
}

const rows = computed<TableRow[]>(() =>
    props.orders.map(order => {
        const isOverdue = order.state === 'PaymentSettled';
        const isWaitingApproval = props.pendingApprovalOrderIds.has(order.id);
        const counterparty = order.customer?.counterparty;
        return {
            code: order.code,
            customer: counterparty?.shortName ?? '—',
            customerMeta: counterparty ? `INN ${counterparty.inn ?? '—'} · ${counterparty.priceType}` : '',
            manager: managerName(order.customer?.counterparty?.assignedManagerId),
            state: ORDER_STATE_LABEL[order.state] ?? order.state,
            total: new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: order.currencyCode,
            }).format(order.totalWithTax / 100),
            date: order.orderPlacedAt ? new Date(order.orderPlacedAt).toLocaleDateString('en-US') : '—',
            branch: branchName(counterparty?.branchId),
            attention: isWaitingApproval ? 'Price limit exceeded' : isOverdue ? 'Shipment overdue' : '',
        };
    }),
);
</script>

<template>
    <MvTable
        :columns="columns"
        :data="rows"
        :height="Math.max(rows.length, props.pageSize ?? 1) * 52 + 40"
        empty-text="No orders match your filters"
        @row-click="openOrder"
    />
</template>

<style scoped>
.orders-table__customer-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
    line-height: 1.3;
}

.orders-table__customer-name {
    font-weight: 700;
}

.orders-table__customer-meta {
    font-size: 12px;
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
