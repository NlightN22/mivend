import type { Meta, StoryObj } from '@storybook/vue3';
import MvCountBadge from './MvCountBadge.vue';

const meta: Meta<typeof MvCountBadge> = {
    title: 'Atoms/MvCountBadge',
    component: MvCountBadge,
    tags: ['autodocs'],
    argTypes: {
        count: { control: 'number' },
    },
    args: { count: 3 },
};

export default meta;
type Story = StoryObj<typeof MvCountBadge>;

export const Default: Story = {
    render: args => ({
        components: { MvCountBadge },
        setup: () => ({ args }),
        template: '<MvCountBadge v-bind="args" />',
    }),
};

export const LargeCount: Story = {
    args: { count: 128 },
    render: args => ({
        components: { MvCountBadge },
        setup: () => ({ args }),
        template: '<MvCountBadge v-bind="args" />',
    }),
};

export const Zero: Story = {
    args: { count: 0 },
    render: args => ({
        components: { MvCountBadge },
        setup: () => ({ args }),
        template: '<div>Hidden when count is 0: <MvCountBadge v-bind="args" /></div>',
    }),
};
