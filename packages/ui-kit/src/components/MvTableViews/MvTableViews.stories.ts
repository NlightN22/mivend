import type { Meta, StoryObj } from '@storybook/vue3';
import MvTableViews from './MvTableViews.vue';

const meta: Meta<typeof MvTableViews> = {
    title: 'Molecules/MvTableViews',
    component: MvTableViews,
    tags: ['autodocs'],
    args: {
        views: [
            { id: '1', name: 'Awaiting confirmation, newest' },
            { id: '2', name: 'Big orders' },
            { id: '3', name: 'Overdue, by customer', shared: true, isDefault: true },
            { id: '4', name: 'Shipping today', shared: true },
        ],
        activeId: '1',
        dirty: false,
    },
};

export default meta;
type Story = StoryObj<typeof MvTableViews>;

export const Default: Story = {};
export const Dirty: Story = { args: { dirty: true } };
export const Empty: Story = { args: { views: [], activeId: '' } };
export const TeamManager: Story = { args: { canManageShared: true, activeId: '3', dirty: true } };
export const TeamReadOnly: Story = { args: { canManageShared: false, activeId: '3', dirty: true } };
export const NearRightEdge: Story = {
    args: { canManageShared: true, activeId: '3', dirty: true },
    decorators: [
        () => ({ template: '<div style="display:flex;justify-content:flex-end"><story /></div>' }),
    ],
};
