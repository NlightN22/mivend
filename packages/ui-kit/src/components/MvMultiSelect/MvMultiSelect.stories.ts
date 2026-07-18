import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import MvMultiSelect from './MvMultiSelect.vue';
import type { SelectOption } from '../MvSelect/MvSelect.vue';

const OPTIONS: SelectOption[] = [
    { value: 'branch-a', label: 'branch-a' },
    { value: 'branch-b', label: 'branch-b' },
    { value: 'branch-c', label: 'branch-c' },
];

const meta: Meta<typeof MvMultiSelect> = {
    title: 'Atoms/MvMultiSelect',
    component: MvMultiSelect,
    tags: ['autodocs'],
    args: {
        modelValue: ['branch-a'],
        options: OPTIONS,
    },
};

export default meta;
type Story = StoryObj<typeof MvMultiSelect>;

export const Default: Story = {
    render: args => ({
        components: { MvMultiSelect },
        setup: () => {
            const value = ref(args.modelValue);
            return { args, value };
        },
        template:
            '<div style="max-width: 260px;"><MvMultiSelect v-bind="args" :model-value="value" @update:model-value="value = $event" /></div>',
    }),
};

export const NoneSelected: Story = {
    args: { modelValue: [] },
    render: args => ({
        components: { MvMultiSelect },
        setup: () => ({ args }),
        template: '<div style="max-width: 260px;"><MvMultiSelect v-bind="args" /></div>',
    }),
};
