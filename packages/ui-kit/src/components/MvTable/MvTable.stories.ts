import type { Meta, StoryObj } from '@storybook/vue3';
import type { Column } from 'element-plus';
import MvTable from './MvTable.vue';
import MvStatusTag from '../MvStatusTag/MvStatusTag.vue';
import MvAmountDisplay from '../MvAmountDisplay/MvAmountDisplay.vue';
import MvButton from '../MvButton/MvButton.vue';
import type { TableRow, RowState } from './MvTable.vue';
import type { StatusTagVariant } from '../MvStatusTag/MvStatusTag.vue';
import { h } from 'vue';

const ROW_STATE_TO_TAG: Record<string, StatusTagVariant> = {
    'in-stock': 'in-stock',
    'low-stock': 'low-stock',
    'by-order': 'by-order',
    'in-cart': 'in-cart',
    reserved: 'reserved',
    unavailable: 'unavailable',
    analog: 'analog',
};

const COLUMNS: Column<TableRow>[] = [
    { key: 'article', title: 'Article', dataKey: 'article', width: 120 },
    { key: 'name', title: 'Product', dataKey: 'name', width: 240 },
    { key: 'brand', title: 'Brand', dataKey: 'brand', width: 110 },
    {
        key: 'status',
        title: 'Status',
        dataKey: '_rowState',
        width: 130,
        cellRenderer: ({ rowData }) => {
            const state = (rowData as TableRow)._rowState;
            const variant = state ? ROW_STATE_TO_TAG[state] : undefined;
            return variant ? h(MvStatusTag, { variant }) : h('span');
        },
    },
    {
        key: 'price',
        title: 'Price',
        dataKey: 'price',
        width: 120,
        align: 'right',
        cellRenderer: ({ cellData }) =>
            h(MvAmountDisplay, {
                amount: cellData as unknown as number,
                currency: '₽',
                size: 'md',
            }),
    },
    {
        key: 'action',
        title: '',
        dataKey: 'action',
        width: 120,
        cellRenderer: ({ rowData }) => {
            const state = (rowData as TableRow)._rowState;
            if (state === 'unavailable') return h('span');
            return h(MvButton, { variant: 'buy', size: 'sm' }, () => 'Add');
        },
    },
];

function makeRows(states: RowState[]): TableRow[] {
    const products = [
        { article: 'OC90', name: 'Oil filter', brand: 'Mahle', price: 420 },
        { article: '0986494063', name: 'Brake pads front', brand: 'Bosch', price: 2940 },
        { article: '5W40-4L', name: 'Motor oil 4L', brand: 'Total', price: 2180 },
        { article: 'CR-35L', name: 'Air filter', brand: 'Mann', price: 890 },
        { article: 'BX-7710', name: 'Timing belt kit', brand: 'Gates', price: 4650 },
        { article: 'SP-331', name: 'Spark plugs set', brand: 'NGK', price: 1240 },
        { article: 'DF-8801', name: 'Drive shaft front left', brand: 'GKN', price: 5800 },
        { article: 'RB-2209', name: 'Front strut bearing', brand: 'SKF', price: 760 },
        { article: 'WP-1142', name: 'Water pump', brand: 'Febi', price: 3300 },
    ];
    return states.map((state, i) => ({ ...products[i % products.length], _rowState: state }));
}

const ALL_STATES: RowState[] = [
    'default',
    'in-stock',
    'low-stock',
    'by-order',
    'in-cart',
    'reserved',
    'unavailable',
    'analog',
    'hover',
];

const meta: Meta<typeof MvTable> = {
    title: 'Components/MvTable',
    component: MvTable,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof MvTable>;

export const Default: Story = {
    render: () => ({
        components: { MvTable },
        setup: () => ({ columns: COLUMNS, data: makeRows(['default', 'in-stock', 'low-stock']) }),
        template: `<div style="padding:24px;"><MvTable :columns="columns" :data="data" :height="220" /></div>`,
    }),
};

export const AllRowStates: Story = {
    render: () => ({
        components: { MvTable },
        setup: () => ({ columns: COLUMNS, data: makeRows(ALL_STATES) }),
        template: `<div style="padding:24px;"><MvTable :columns="columns" :data="data" :height="480" /></div>`,
    }),
};

export const Loading: Story = {
    render: () => ({
        components: { MvTable },
        setup: () => ({ columns: COLUMNS, data: makeRows(['default', 'in-stock']) }),
        template: `<div style="padding:24px;"><MvTable :columns="columns" :data="data" :loading="true" :height="220" /></div>`,
    }),
};

export const Empty: Story = {
    render: () => ({
        components: { MvTable },
        setup: () => ({ columns: COLUMNS, data: [] }),
        template: `<div style="padding:24px;"><MvTable :columns="columns" :data="data" empty-text="No products match your search" :height="220" /></div>`,
    }),
};
