import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import MvDateRangeField from './MvDateRangeField.vue';

const meta: Meta<typeof MvDateRangeField> = {
    title: 'Atoms/MvDateRangeField',
    component: MvDateRangeField,
    decorators: [() => ({ template: '<div style="width:340px;min-height:320px"><story /></div>' })],
};

export default meta;

export const Backwards: StoryObj<typeof MvDateRangeField> = {
    render: () => ({
        components: { MvDateRangeField },
        setup: () => ({ from: ref('2026-03-31'), to: ref('2026-03-01') }),
        template: '<MvDateRangeField v-model:from="from" v-model:to="to" />',
    }),
};
