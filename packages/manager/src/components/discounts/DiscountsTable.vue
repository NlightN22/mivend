<script setup lang="ts">
import { computed, h } from 'vue';
import { useRouter } from 'vue-router';
import type { Column } from 'element-plus';
import { MvTable, MvStatusBadge, MvTooltip } from '@mivend/ui-kit';
import type { TableRow } from '@mivend/ui-kit';
import type { DiscountRow, DiscountRowStatus } from '../../api/discounts';

const props = defineProps<{ rows: DiscountRow[] }>();
const emit = defineEmits<{ renew: [row: DiscountRow] }>();
const router = useRouter();

const STATUS_LABEL: Record<DiscountRowStatus, string> = {
    active: 'Active',
    'expiring-soon': 'Expiring soon',
    expired: 'Expired',
    pending: 'Pending approval',
    rejected: 'Rejected',
};

const STATUS_VARIANT: Record<DiscountRowStatus, 'success' | 'warning' | 'neutral' | 'info' | 'danger'> = {
    active: 'success',
    'expiring-soon': 'warning',
    expired: 'neutral',
    pending: 'info',
    rejected: 'danger',
};

function findRow(key: string): DiscountRow | undefined {
    return props.rows.find(r => r.key === key);
}

const columns = computed<Column<TableRow>[]>(() => [
    { key: 'customer', title: 'Customer', dataKey: 'customer', width: 180 },
    { key: 'priceType', title: 'Price type', dataKey: 'priceType', width: 130 },
    { key: 'facet', title: 'Product group', dataKey: 'facet', width: 160 },
    {
        key: 'percent',
        title: 'Discount %',
        dataKey: 'percent',
        width: 110,
        align: 'right',
        cellRenderer: ({ cellData }) => {
            const value = cellData as unknown as number;
            return h('span', value < 0 ? { style: 'color:#b45309;font-weight:700' } : {}, `${value}%`);
        },
    },
    { key: 'validRange', title: 'Valid from — to', dataKey: 'validRange', width: 210 },
    {
        key: 'status',
        title: 'Status',
        dataKey: 'status',
        width: 140,
        cellRenderer: ({ rowData }) => {
            const status = (rowData as TableRow).status as DiscountRowStatus;
            return h(MvStatusBadge, { variant: STATUS_VARIANT[status] }, () => STATUS_LABEL[status]);
        },
    },
    {
        key: 'justification',
        title: 'Justification',
        dataKey: 'justification',
        width: 200,
        cellRenderer: ({ cellData }) => {
            const text = (cellData as unknown as string) || '—';
            if (text === '—') return h('span', '—');
            return h(MvTooltip, {}, { default: () => text, trigger: () => h('span', { class: 'discounts-table__truncated' }, text) });
        },
    },
    {
        key: 'action',
        title: '',
        dataKey: 'action',
        width: 130,
        cellRenderer: ({ rowData }) => {
            const key = (rowData as TableRow)._key as string;
            const row = findRow(key);
            if (row?.status === 'expiring-soon') {
                return h(
                    'button',
                    { class: 'discounts-table__renew', onClick: () => emit('renew', row) },
                    'Renew',
                );
            }
            if (row?.approvalRequestId) {
                return h(
                    'button',
                    {
                        class: 'discounts-table__renew',
                        onClick: () => router.push(`/approvals/${row.approvalRequestId}`),
                    },
                    'View request',
                );
            }
            return h('span', '');
        },
    },
]);

const rows = computed<TableRow[]>(() =>
    props.rows.map(row => ({
        customer: row.customer,
        priceType: row.priceType,
        facet: row.facet,
        percent: row.percent,
        validRange: `${new Date(row.validFrom).toLocaleDateString('en-US')} — ${new Date(row.validTo).toLocaleDateString('en-US')}`,
        status: row.status,
        justification: row.justification ?? '',
        _key: row.key,
    })),
);
</script>

<template>
    <MvTable
        :columns="columns"
        :data="rows"
        :height="Math.max(rows.length, 1) * 52 + 40"
        empty-text="No discount grants yet"
    />
</template>

<style>
.discounts-table__truncated {
    display: inline-block;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: middle;
    cursor: help;
}

.discounts-table__renew {
    background: none;
    border: none;
    color: var(--el-color-primary-dark-2, #008a70);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
}
</style>
