<script setup lang="ts">
import { formatDate, formatMoney } from '../../i18n/format';
import { computed, h } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import type { Column } from 'element-plus';
import { MvTable, MvStatusBadge, formatDocumentNumber } from '@mivend/ui-kit';
import type { TableRow, StatusBadgeVariant } from '@mivend/ui-kit';
import type { RecentOrder } from '../../api/dashboard';
import { ORDER_STATE_LABEL, ORDER_STATE_BADGE_VARIANT } from '../../api/orders';

const props = defineProps<{ orders: RecentOrder[] }>();
const router = useRouter();
const { t } = useI18n();

const columns = computed<Column<TableRow>[]>(() => [
    { key: 'code', title: t('dashboardParts.orders.order'), dataKey: 'codeDisplay', width: 170 },
    {
        key: 'customer',
        title: t('dashboardParts.orders.customer'),
        dataKey: 'customer',
        width: 160,
    },
    {
        key: 'state',
        title: t('dashboardParts.orders.status'),
        dataKey: 'state',
        width: 170,
        cellRenderer: ({ rowData }) => {
            const row = rowData as TableRow;
            return h(
                MvStatusBadge,
                { variant: row.stateVariant as StatusBadgeVariant },
                () => row.state as string,
            );
        },
    },
    {
        key: 'total',
        title: t('dashboardParts.orders.total'),
        dataKey: 'total',
        width: 120,
        align: 'right',
    },
    { key: 'date', title: t('dashboardParts.orders.date'), dataKey: 'date', width: 120 },
]);

const rows = computed<TableRow[]>(() =>
    props.orders.map(order => ({
        code: order.code,
        codeDisplay: formatDocumentNumber(order.code),
        customer: order.customer ? `${order.customer.firstName} ${order.customer.lastName}` : '—',
        state: ORDER_STATE_LABEL[order.state] ?? order.state,
        stateVariant: ORDER_STATE_BADGE_VARIANT[order.state] ?? 'neutral',
        total: formatMoney(order.totalWithTax, order.currencyCode),
        date: formatDate(order.createdAt),
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
        :empty-text="t('dashboardParts.orders.empty')"
        @row-click="handleRowClick"
    />
</template>
