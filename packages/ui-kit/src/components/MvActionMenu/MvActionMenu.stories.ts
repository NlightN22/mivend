import type { Meta, StoryObj } from '@storybook/vue3';
import MvActionMenu from './MvActionMenu.vue';

const meta: Meta<typeof MvActionMenu> = {
    title: 'Molecules/MvActionMenu',
    component: MvActionMenu,
    tags: ['autodocs'],
    args: {
        items: [
            { key: 'recompute', label: 'Recompute checks' },
            { key: 'release', label: 'Release reservation', disabled: true },
            { key: 'cancel', label: 'Cancel order', danger: true },
        ],
    },
};

export default meta;
type Story = StoryObj<typeof MvActionMenu>;

export const Default: Story = {};
