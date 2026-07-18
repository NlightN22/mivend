import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import MvCheckbox from './MvCheckbox.vue';

const meta: Meta<typeof MvCheckbox> = {
    title: 'Atoms/MvCheckbox',
    component: MvCheckbox,
    tags: ['autodocs'],
    argTypes: {
        modelValue: { control: 'boolean' },
        label: { control: 'text' },
        disabled: { control: 'boolean' },
    },
    args: {
        modelValue: false,
        label: 'Show archived orders',
        disabled: false,
    },
};

export default meta;
type Story = StoryObj<typeof MvCheckbox>;

export const Default: Story = {
    render: args => ({
        components: { MvCheckbox },
        setup: () => {
            const checked = ref(args.modelValue);
            return { checked };
        },
        template: '<MvCheckbox v-model="checked" label="Show archived orders" />',
    }),
};

export const Checked: Story = {
    args: { modelValue: true },
    render: args => ({
        components: { MvCheckbox },
        setup: () => ({ args }),
        template: '<MvCheckbox :model-value="true" :label="args.label" />',
    }),
};

export const Disabled: Story = {
    args: { modelValue: false, disabled: true },
    render: args => ({
        components: { MvCheckbox },
        setup: () => ({ args }),
        template: '<MvCheckbox v-bind="args" />',
    }),
};
