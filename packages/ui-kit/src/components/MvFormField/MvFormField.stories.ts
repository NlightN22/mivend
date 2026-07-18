import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import MvFormField from './MvFormField.vue';
import MvInput from '../MvInput/MvInput.vue';

const meta: Meta<typeof MvFormField> = {
    title: 'Molecules/MvFormField',
    component: MvFormField,
    tags: ['autodocs'],
    argTypes: {
        label: { control: 'text' },
        error: { control: 'text' },
        required: { control: 'boolean' },
    },
    args: {
        label: 'Customer name',
        required: false,
    },
};

export default meta;
type Story = StoryObj<typeof MvFormField>;

export const Default: Story = {
    render: args => ({
        components: { MvFormField, MvInput },
        setup: () => {
            const value = ref('');
            return { args, value };
        },
        template:
            '<MvFormField v-bind="args"><MvInput v-model="value" placeholder="Enter name" /></MvFormField>',
    }),
};

export const Required: Story = {
    args: { required: true },
    render: args => ({
        components: { MvFormField, MvInput },
        setup: () => {
            const value = ref('');
            return { args, value };
        },
        template:
            '<MvFormField v-bind="args"><MvInput v-model="value" placeholder="Enter name" /></MvFormField>',
    }),
};

export const WithError: Story = {
    args: { error: 'Customer name is required.', required: true },
    render: args => ({
        components: { MvFormField, MvInput },
        setup: () => {
            const value = ref('');
            return { args, value };
        },
        template:
            '<MvFormField v-bind="args"><MvInput v-model="value" :error="true" /></MvFormField>',
    }),
};
