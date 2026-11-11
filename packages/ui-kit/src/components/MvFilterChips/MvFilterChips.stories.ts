import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import MvFilterChips from './MvFilterChips.vue';
import type { FilterChip } from './MvFilterChips.vue';
import { CATEGORICAL_VARIANTS } from '../MvStatusBadge/categoricalVariants';

const CHIPS: FilterChip[] = [
    { key: 'all', label: 'All' },
    { key: 'overdue', label: 'Overdue' },
    { key: 'awaiting-approval', label: 'Awaiting approval' },
];

const meta: Meta<typeof MvFilterChips> = {
    title: 'Molecules/MvFilterChips',
    component: MvFilterChips,
    tags: ['autodocs'],
    args: { chips: CHIPS, active: 'all' },
};

export default meta;
type Story = StoryObj<typeof MvFilterChips>;

export const Default: Story = {
    render: args => ({
        components: { MvFilterChips },
        setup: () => {
            const active = ref(args.active);
            return { args, active };
        },
        template:
            '<MvFilterChips :chips="args.chips" :active="active" @select="active = $event" />',
    }),
};

export const WithCounts: Story = {
    render: () => ({
        components: { MvFilterChips },
        setup: () => {
            const active = ref('awaiting');
            const chips: FilterChip[] = [
                {
                    key: 'awaiting',
                    label: 'Awaiting confirmation',
                    variant: 'warning',
                    count: 7,
                    emphasis: true,
                },
                { key: 'all', label: 'All', count: 1240 },
                { key: 'overdue', label: 'Overdue', variant: 'danger', count: 0 },
            ];
            return { active, chips };
        },
        template: '<MvFilterChips :chips="chips" :active="active" @select="active = $event" />',
    }),
};

const MANY_CHIPS: FilterChip[] = [
    { key: 'awaiting', label: 'Awaiting confirmation', variant: 'warning', count: 169 },
    { key: 'all', label: 'All', count: 1358 },
    { key: 'processing', label: 'Processing', variant: 'info', count: 0 },
    { key: 'shipment', label: 'Awaiting shipment', variant: 'info', count: 1 },
    { key: 'overdue', label: 'Overdue', variant: 'danger', count: 1 },
    { key: 'rejected', label: 'Rejected by ERP', variant: 'danger', count: 0 },
    { key: 'failed', label: 'Reservation failed', variant: 'warning', count: 119 },
    { key: 'blocked', label: 'Blocked by ERP requirements', variant: 'warning', count: 232 },
];

const manyTemplate = {
    components: { MvFilterChips },
    setup: () => ({ active: ref('awaiting'), chips: MANY_CHIPS }),
    template: '<MvFilterChips :chips="chips" :active="active" @select="active = $event" />',
};

export const TwoRowsWithMore: Story = { render: () => manyTemplate };

export const TwoRowsWithMoreOnPhone: Story = {
    render: () => manyTemplate,
    parameters: { viewport: { defaultViewport: 'mvMobile' } },
};

export const ActiveChipStaysVisible: Story = {
    render: () => ({
        ...manyTemplate,
        setup: () => ({ active: ref('blocked'), chips: MANY_CHIPS }),
    }),
    parameters: { viewport: { defaultViewport: 'mvMobile' } },
};

export const LoadingCounts: Story = {
    args: {
        chips: [
            { key: 'all', label: 'All', countLoading: true },
            { key: 'overdue', label: 'Overdue', variant: 'danger', countLoading: true },
            { key: 'awaiting-approval', label: 'Awaiting approval', countLoading: true },
        ],
    },
};

export const CategoricalColours: Story = {
    render: () => ({
        components: { MvFilterChips },
        setup: () => {
            const active = ref('t3');
            const chips: FilterChip[] = CATEGORICAL_VARIANTS.map((variant, i) => ({
                key: `t${i + 1}`,
                label: `Document type ${i + 1}`,
                variant,
                count: (i + 1) * 12,
            }));
            return { chips, active };
        },
        template: '<MvFilterChips :chips="chips" :active="active" @select="active = $event" />',
    }),
};
