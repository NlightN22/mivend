import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import MvQtyStepper from './MvQtyStepper.vue';

const meta: Meta<typeof MvQtyStepper> = {
    title: 'Atoms/MvQtyStepper',
    component: MvQtyStepper,
    tags: ['autodocs'],
    argTypes: {
        min: { control: 'number' },
        step: { control: 'number' },
        disabled: { control: 'boolean' },
        size: { control: 'select', options: ['md', 'sm'] },
    },
    args: {
        modelValue: 1,
        min: 1,
        step: 1,
        disabled: false,
        size: 'md',
    },
};

export default meta;
type Story = StoryObj<typeof MvQtyStepper>;

export const Default: Story = {
    render: args => ({
        components: { MvQtyStepper },
        setup: () => {
            const qty = ref(args.modelValue);
            return { args, qty };
        },
        template:
            '<MvQtyStepper v-bind="args" :model-value="qty" @update:model-value="qty = $event" />',
    }),
};

export const Small: Story = {
    args: { size: 'sm' },
    render: args => ({
        components: { MvQtyStepper },
        setup: () => {
            const qty = ref(args.modelValue);
            return { args, qty };
        },
        template:
            '<MvQtyStepper v-bind="args" :model-value="qty" @update:model-value="qty = $event" />',
    }),
};

export const MultiplicityStep: Story = {
    args: { step: 10, modelValue: 10, min: 10 },
    render: args => ({
        components: { MvQtyStepper },
        setup: () => {
            const qty = ref(args.modelValue);
            return { args, qty };
        },
        template:
            '<MvQtyStepper v-bind="args" :model-value="qty" @update:model-value="qty = $event" />',
    }),
};

export const Disabled: Story = {
    args: { disabled: true, modelValue: 3 },
    render: args => ({
        components: { MvQtyStepper },
        setup: () => ({ args }),
        template: '<MvQtyStepper v-bind="args" />',
    }),
};
