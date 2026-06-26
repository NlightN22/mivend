<template>
    <div>
        <MvPageHeader
            :title="t('orders.title')"
            :breadcrumbs="[{ label: 'Home', to: '/' }, { label: t('orders.title') }]"
        />

        <MvTable
            :columns="columns"
            :data="rows"
            :height="480"
            :empty-text="t('orders.empty')"
        />
    </div>
</template>

<script setup lang="ts">
import { h } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Column } from 'element-plus';
import type { TableRow } from '@mivend/ui-kit';
import MvAmountDisplay from '@mivend/ui-kit/src/components/MvAmountDisplay/MvAmountDisplay.vue';
import MvStatusTag from '@mivend/ui-kit/src/components/MvStatusTag/MvStatusTag.vue';
import MvButton from '@mivend/ui-kit/src/components/MvButton/MvButton.vue';
import type { StatusTagVariant } from '@mivend/ui-kit/src/components/MvStatusTag/MvStatusTag.vue';

const { t } = useI18n();

const ORDER_STATUS_MAP: Record<string, StatusTagVariant> = {
    processing: 'by-order',
    shipped: 'in-stock',
    delivered: 'original',
    reserved: 'reserved',
    cancelled: 'unavailable',
};

const STUB_ROWS: TableRow[] = [
    { number: '#10042', date: '2026-06-25', status: 'delivered', items: 4, total: 8540 },
    { number: '#10041', date: '2026-06-24', status: 'shipped', items: 2, total: 3360 },
    { number: '#10040', date: '2026-06-22', status: 'processing', items: 7, total: 15200 },
    { number: '#10039', date: '2026-06-20', status: 'reserved', items: 1, total: 2940 },
    { number: '#10038', date: '2026-06-18', status: 'cancelled', items: 3, total: 4190 },
];

const columns: Column<TableRow>[] = [
    { key: 'number', title: t('orders.orderNumber'), dataKey: 'number', width: 110 },
    { key: 'date', title: t('orders.date'), dataKey: 'date', width: 130 },
    {
        key: 'status',
        title: t('orders.status'),
        dataKey: 'status',
        width: 140,
        cellRenderer: ({ cellData }) => {
            const status = cellData as unknown as string;
            const variant = ORDER_STATUS_MAP[status];
            return variant ? h(MvStatusTag, { variant }, () => status) : h('span', status);
        },
    },
    { key: 'items', title: 'Items', dataKey: 'items', width: 80 },
    {
        key: 'total',
        title: t('orders.total'),
        dataKey: 'total',
        width: 150,
        align: 'right',
        cellRenderer: ({ cellData }) =>
            h(MvAmountDisplay, { amount: cellData as unknown as number, currency: '₽', size: 'md' }),
    },
    {
        key: 'action',
        title: '',
        dataKey: 'number',
        width: 140,
        cellRenderer: () => h(MvButton, { variant: 'ghost', size: 'sm' }, () => 'Repeat order'),
    },
];

const rows = STUB_ROWS;
</script>
