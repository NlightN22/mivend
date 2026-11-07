import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import MvFilterChips from './MvFilterChips.vue';
import type { FilterChip } from './MvFilterChips.vue';

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
        template:
            '<MvFilterChips scrollable :chips="chips" :active="active" @select="active = $event" />',
    }),
};
