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
