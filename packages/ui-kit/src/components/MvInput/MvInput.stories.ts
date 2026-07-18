import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import MvInput from './MvInput.vue';
import type { InputSize } from './MvInput.vue';

const SIZES: InputSize[] = ['md', 'sm'];

const meta: Meta<typeof MvInput> = {
    title: 'Atoms/MvInput',
    component: MvInput,
    tags: ['autodocs'],
    argTypes: {
        size: { control: 'select', options: SIZES },
        disabled: { control: 'boolean' },
        error: { control: 'boolean' },
        placeholder: { control: 'text' },
    },
    args: {
        modelValue: '',
        placeholder: 'Enter SKU',
        size: 'md',
        disabled: false,
        error: false,
    },
};

export default meta;
type Story = StoryObj<typeof MvInput>;

export const Default: Story = {
    render: args => ({
        components: { MvInput },
        setup: () => {
            const value = ref('');
            return { args, value };
        },
        template: '<MvInput v-model="value" v-bind="args" />',
    }),
};

export const Small: Story = {
    args: { size: 'sm' },
    render: args => ({
        components: { MvInput },
        setup: () => {
            const value = ref('');
            return { args, value };
        },
        template: '<MvInput v-model="value" v-bind="args" />',
    }),
};

export const ErrorState: Story = {
    args: { error: true, modelValue: 'ABC' },
    render: args => ({
        components: { MvInput },
        setup: () => {
            const value = ref('ABC');
            return { args, value };
        },
        template: '<MvInput v-model="value" v-bind="args" />',
    }),
};

export const Disabled: Story = {
    args: { disabled: true, modelValue: 'sku-10021' },
    render: args => ({
        components: { MvInput },
        setup: () => {
            const value = ref('sku-10021');
            return { args, value };
        },
        template: '<MvInput v-model="value" v-bind="args" />',
    }),
};
