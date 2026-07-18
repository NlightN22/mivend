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
