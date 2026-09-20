import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import MvSwitch from './MvSwitch.vue';

const meta: Meta<typeof MvSwitch> = {
    title: 'Atoms/MvSwitch',
    component: MvSwitch,
    tags: ['autodocs'],
    argTypes: {
        modelValue: { control: 'boolean' },
        label: { control: 'text' },
        disabled: { control: 'boolean' },
    },
    args: {
        modelValue: true,
        disabled: false,
    },
};

export default meta;
type Story = StoryObj<typeof MvSwitch>;

export const Default: Story = {
    render: args => ({
        components: { MvSwitch },
        setup: () => {
            const checked = ref(args.modelValue);
            return { checked };
        },
        template: '<MvSwitch v-model="checked" />',
    }),
};

export const Off: Story = {
    args: { modelValue: false },
    render: args => ({
        components: { MvSwitch },
        setup: () => ({ args }),
        template: '<MvSwitch :model-value="false" />',
    }),
};

export const Disabled: Story = {
    args: { modelValue: true, disabled: true },
    render: args => ({
        components: { MvSwitch },
        setup: () => ({ args }),
        template: '<MvSwitch v-bind="args" />',
    }),
};
