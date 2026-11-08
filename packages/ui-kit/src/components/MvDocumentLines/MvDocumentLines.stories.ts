import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import { useLineSelection } from '../../composables/useLineSelection';
import MvDocumentLines from './MvDocumentLines.vue';
import MvDocumentTotals from './MvDocumentTotals.vue';
import type { DocColumn, DocRow } from './documentLinesModel';

interface DemoRow extends DocRow {
    name: string;
    qty: number;
    price: string;
}

const columns: DocColumn[] = [
    { key: 'name', label: 'Item' },
    { key: 'qty', label: 'Qty' },
    { key: 'price', label: 'Price' },
];
const rows: DemoRow[] = [
    { id: '1', name: 'Clean line', qty: 2, price: '10.00' },
    {
        id: '2',
        name: 'Price below the minimum',
        qty: 1,
        price: '5.00',
        flags: {
            price: {
                tone: 'danger',
                notes: [
                    {
                        text: 'The unit price is below the floor',
                        badge: { label: 'Block', variant: 'danger' },
                    },
                ],
                actions: [{ key: 'reject', label: 'Reject', variant: 'secondary' }],
            },
        },
    },
    {
        id: '3',
        name: 'Waiting for approval',
        qty: 4,
        price: '8.00',
        flags: { price: { tone: 'orange', notes: [{ text: 'Requires approval' }] } },
    },
];

const meta: Meta = {
    title: 'Organisms/MvDocumentLines',
    component: MvDocumentLines as never,
    tags: ['autodocs'],
};
export default meta;
type Story = StoryObj;

export const WithFlagsAndTotals: Story = {
    render: () => ({
        components: { MvDocumentLines, MvDocumentTotals },
        setup: () => ({
            columns,
            rows,
            selection: useLineSelection(ref(rows.map(r => r.id))),
            totals: [
                { key: 'positions', label: 'Positions', value: '3' },
                { key: 'total', label: 'Total', value: '$61.00', emphasis: true },
            ],
        }),
        template: `<MvDocumentLines title="Lines" :columns="columns" :rows="rows" :selection="selection"
            :can-edit="() => true" :can-remove="() => true">
            <template #cell-name="{ row }">{{ row.name }}</template>
            <template #cell-qty="{ row }">{{ row.qty }}</template>
            <template #cell-price="{ row }">{{ row.price }}</template>
            <template #totals><MvDocumentTotals :rows="totals" /></template>
        </MvDocumentLines>`,
    }),
};

export const Loading: Story = {
    render: () => ({
        components: { MvDocumentLines },
        setup: () => ({ columns }),
        template: '<MvDocumentLines title="Lines" :columns="columns" :rows="[]" loading />',
    }),
};
