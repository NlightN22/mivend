import type { Meta, StoryObj } from '@storybook/vue3';
import MvFlaggedValue from './MvFlaggedValue.vue';

const meta: Meta<typeof MvFlaggedValue> = {
    title: 'Atoms/MvFlaggedValue',
    component: MvFlaggedValue,
    tags: ['autodocs'],
    argTypes: { severity: { control: 'select', options: ['warning', 'danger'] } },
    args: { severity: 'danger', tooltip: 'Price is below the allowed minimum' },
};

export default meta;
type Story = StoryObj<typeof MvFlaggedValue>;

export const Danger: Story = {
    render: args => ({
        components: { MvFlaggedValue },
        setup: () => ({ args }),
        template: '<MvFlaggedValue v-bind="args">573.75</MvFlaggedValue>',
    }),
};

export const Warning: Story = {
    args: { severity: 'warning', tooltip: 'Discount above the allowed maximum (max 10%)' },
    render: Danger.render,
};
