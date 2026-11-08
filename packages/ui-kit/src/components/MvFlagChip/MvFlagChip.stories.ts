import type { Meta, StoryObj } from '@storybook/vue3';
import MvFlagChip from './MvFlagChip.vue';

const meta: Meta<typeof MvFlagChip> = {
    title: 'Atoms/MvFlagChip',
    component: MvFlagChip,
    tags: ['autodocs'],
    argTypes: { tone: { control: 'select', options: ['danger', 'orange', 'warning', 'info'] } },
    args: { tone: 'danger', label: 'Show what is wrong here' },
};

export default meta;
type Story = StoryObj<typeof MvFlagChip>;

export const Danger: Story = {
    render: args => ({
        components: { MvFlagChip },
        setup: () => ({ args }),
        template: '<MvFlagChip v-bind="args">0 / 2</MvFlagChip>',
    }),
};

export const Orange: Story = { args: { tone: 'orange' }, render: Danger.render };

export const Warning: Story = { args: { tone: 'warning' }, render: Danger.render };

export const IconOnly: Story = {
    render: args => ({
        components: { MvFlagChip },
        setup: () => ({ args }),
        template: '<MvFlagChip v-bind="args" />',
    }),
};
