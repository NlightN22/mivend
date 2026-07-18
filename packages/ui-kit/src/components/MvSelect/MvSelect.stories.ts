import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import MvSelect from './MvSelect.vue';
import type { SelectOption } from './MvSelect.vue';

const OPTIONS: SelectOption[] = [
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
];

const meta: Meta<typeof MvSelect> = {
    title: 'Atoms/MvSelect',
    component: MvSelect,
    tags: ['autodocs'],
    argTypes: {
        disabled: { control: 'boolean' },
    },
    args: {
        modelValue: 'pending',
        options: OPTIONS,
        disabled: false,
    },
};

export default meta;
type Story = StoryObj<typeof MvSelect>;

export const Default: Story = {
    render: args => ({
        components: { MvSelect },
        setup: () => {
            const value = ref(args.modelValue);
            return { args, value };
        },
        template:
            '<MvSelect v-bind="args" :model-value="value" @update:model-value="value = $event" />',
    }),
};

export const Disabled: Story = {
    args: { disabled: true },
    render: args => ({
        components: { MvSelect },
        setup: () => ({ args }),
        template: '<MvSelect v-bind="args" />',
    }),
};
