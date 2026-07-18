import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import MvPasswordInput from './MvPasswordInput.vue';

const meta: Meta<typeof MvPasswordInput> = {
    title: 'Atoms/MvPasswordInput',
    component: MvPasswordInput,
    tags: ['autodocs'],
    argTypes: {
        disabled: { control: 'boolean' },
        error: { control: 'boolean' },
        placeholder: { control: 'text' },
    },
    args: {
        modelValue: '',
        placeholder: 'Password',
        disabled: false,
        error: false,
    },
};

export default meta;
type Story = StoryObj<typeof MvPasswordInput>;

export const Default: Story = {
    render: args => ({
        components: { MvPasswordInput },
        setup: () => {
            const value = ref('');
            return { args, value };
        },
        template: '<MvPasswordInput v-model="value" v-bind="args" />',
    }),
};

export const ErrorState: Story = {
    args: { error: true, modelValue: '123' },
    render: args => ({
        components: { MvPasswordInput },
        setup: () => {
            const value = ref('123');
            return { args, value };
        },
        template: '<MvPasswordInput v-model="value" v-bind="args" />',
    }),
};
