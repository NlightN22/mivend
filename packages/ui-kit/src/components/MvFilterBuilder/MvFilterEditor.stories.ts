import type { Meta, StoryObj } from '@storybook/vue3';
import MvFilterEditor from './MvFilterEditor.vue';
import type { FilterColumn } from './filterBuilderTypes';
import { SAMPLE_COLUMNS } from './filterBuilderFixtures';

const column = (key: string): FilterColumn => SAMPLE_COLUMNS.find(c => c.key === key)!;

const meta: Meta<typeof MvFilterEditor> = {
    title: 'Molecules/MvFilterEditor',
    component: MvFilterEditor,
    tags: ['autodocs'],
    decorators: [() => ({ template: '<div style="width:300px"><story /></div>' })],
};

export default meta;
type Story = StoryObj<typeof MvFilterEditor>;

export const StringColumn: Story = { args: { column: column('code') } };
export const NumberColumn: Story = { args: { column: column('total') } };
export const NumberBetween: Story = {
    args: {
        column: column('total'),
        initial: { columnKey: 'total', operator: 'between', value: ['100', '500'] },
    },
};
export const DateColumn: Story = { args: { column: column('date') } };
export const DateBetween: Story = {
    args: {
        column: column('date'),
        initial: { columnKey: 'date', operator: 'between', value: ['2026-01-01', '2026-03-31'] },
    },
};
export const BooleanColumn: Story = { args: { column: column('paid') } };
export const SelectAnyOf: Story = {
    args: {
        column: column('state'),
        initial: { columnKey: 'state', operator: 'in', value: ['Shipped'] },
    },
};
export const Id: Story = { args: { column: column('customerId') } };
