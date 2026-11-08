import type { Meta, StoryObj } from '@storybook/vue3';
import MvBatchResultTable from './MvBatchResultTable.vue';

const ROWS = [
    {
        targetId: '101',
        label: 'Alpha Trading',
        outcome: 'applied',
        reasonCode: null,
        message: null,
    },
    {
        targetId: '102',
        label: 'Beta Supply',
        outcome: 'skipped',
        reasonCode: 'no_contact',
        message: 'Phone or e-mail is missing',
    },
    {
        targetId: '103',
        label: 'Gamma Parts',
        outcome: 'failed',
        reasonCode: 'error',
        message: 'Counterparty has no INN',
    },
    { targetId: '104', label: null, outcome: null, reasonCode: null, message: null },
];

const meta: Meta<typeof MvBatchResultTable> = {
    title: 'Organisms/MvBatchResultTable',
    component: MvBatchResultTable,
    tags: ['autodocs'],
    args: { rows: ROWS, counters: { total: 4, applied: 1, skipped: 1, failed: 1 } },
};

export default meta;
type Story = StoryObj<typeof MvBatchResultTable>;

const render: Story['render'] = args => ({
    components: { MvBatchResultTable },
    setup: () => ({ args }),
    template: '<MvBatchResultTable v-bind="args" />',
});

export const Result: Story = { render };

export const Review: Story = {
    render,
    args: {
        mode: 'review',
        rows: [
            {
                targetId: '101',
                label: 'Alpha Trading',
                outcome: 'apply',
                reasonCode: null,
                message: null,
            },
            {
                targetId: '102',
                label: 'Beta Supply',
                outcome: 'skip',
                reasonCode: 'already_active',
                message: null,
            },
        ],
        counters: { total: 2, applied: 1, skipped: 1, failed: 0 },
    },
};

export const Empty: Story = {
    render,
    args: { rows: [], counters: { total: 0, applied: 0, skipped: 0, failed: 0 } },
};
