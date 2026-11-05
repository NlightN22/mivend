import type { Meta, StoryObj } from '@storybook/vue3';
import { IconCategory, IconClipboardList, IconDots, IconHeart } from '@tabler/icons-vue';
import MvBottomTabBar from './MvBottomTabBar.vue';

const meta: Meta<typeof MvBottomTabBar> = {
    title: 'Organisms/MvBottomTabBar',
    component: MvBottomTabBar,
    tags: ['autodocs'],
    args: {
        items: [
            { key: 'catalog', label: 'Catalogue', icon: IconCategory, active: false },
            { key: 'orders', label: 'Orders', icon: IconClipboardList, active: true },
            {
                key: 'favorites',
                label: 'Favourites',
                icon: IconHeart,
                active: false,
                badgeCount: 3,
            },
            { key: 'more', label: 'More', icon: IconDots, active: false },
        ],
    },
    parameters: { viewport: { defaultViewport: 'mvMobile' } },
};

export default meta;
export const Default: StoryObj<typeof MvBottomTabBar> = {};
