import { ref } from 'vue';
import type { Meta, StoryObj } from '@storybook/vue3';
import MvFilterBuilder from './MvFilterBuilder.vue';
import type { FilterCondition } from './filterBuilderTypes';
import { SAMPLE_COLUMNS } from './filterBuilderFixtures';

const meta: Meta<typeof MvFilterBuilder> = {
    title: 'Molecules/MvFilterBuilder',
    component: MvFilterBuilder,
    tags: ['autodocs'],
    args: { columns: SAMPLE_COLUMNS },
    render: args => ({
        components: { MvFilterBuilder },
        setup() {
            const conditions = ref<FilterCondition[]>(
                (args as { modelValue?: FilterCondition[] }).modelValue ?? [],
            );
            return { args, conditions };
        },
        template: '<MvFilterBuilder v-bind="args" v-model="conditions" />',
    }),
};

export default meta;
type Story = StoryObj<typeof MvFilterBuilder>;

export const Empty: Story = {};
export const NoColumns: Story = { args: { columns: [] } };
export const WithChips: Story = {
    args: {
        modelValue: [
            { columnKey: 'total', operator: 'gt', value: '1000' },
            { columnKey: 'state', operator: 'in', value: ['Shipped', 'Delivered'] },
            { columnKey: 'code', operator: 'startsWith', value: '1000' },
        ],
    } as Record<string, unknown>,
};
export const BetweenRanges: Story = {
    args: {
        modelValue: [
            { columnKey: 'total', operator: 'between', value: ['100', '500'] },
            { columnKey: 'date', operator: 'between', value: ['2026-01-01', '2026-03-31'] },
        ],
    } as Record<string, unknown>,
};
export const ValuelessOperators: Story = {
    args: {
        modelValue: [
            { columnKey: 'paid', operator: 'isTrue', value: '' },
            { columnKey: 'code', operator: 'isNull', value: '' },
        ],
    } as Record<string, unknown>,
};
