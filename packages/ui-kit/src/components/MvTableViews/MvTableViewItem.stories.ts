import type { Meta, StoryObj } from '@storybook/vue3';
import MvTableViewItem from './MvTableViewItem.vue';

const meta: Meta<typeof MvTableViewItem> = {
    title: 'Molecules/MvTableViewItem',
    component: MvTableViewItem,
    tags: ['autodocs'],
    args: {
        view: { id: '1', name: 'Big orders' },
        active: false,
        manageable: true,
    },
};

export default meta;
type Story = StoryObj<typeof MvTableViewItem>;

export const Personal: Story = {};
export const TeamDefaultManager: Story = {
    args: { view: { id: '2', name: 'Overdue', shared: true, isDefault: true }, active: true },
};
export const TeamReadOnly: Story = {
    args: { view: { id: '3', name: 'Shipping today', shared: true }, manageable: false },
};
