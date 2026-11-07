import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import MvDateField from './MvDateField.vue';

const meta: Meta<typeof MvDateField> = {
    title: 'Atoms/MvDateField',
    component: MvDateField,
    tags: ['autodocs'],
    decorators: [() => ({ template: '<div style="width:260px;min-height:300px"><story /></div>' })],
};

export default meta;
type Story = StoryObj<typeof MvDateField>;

export const Empty: Story = {
    render: () => ({
        components: { MvDateField },
        setup: () => ({ value: ref('') }),
        template: '<MvDateField v-model="value" />',
    }),
};

export const Filled: Story = {
    render: () => ({
        components: { MvDateField },
        setup: () => ({ value: ref('2026-03-31') }),
        template: '<MvDateField v-model="value" />',
    }),
};
