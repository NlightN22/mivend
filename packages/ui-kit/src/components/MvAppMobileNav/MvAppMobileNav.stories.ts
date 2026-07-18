import type { Meta, StoryObj } from '@storybook/vue3';
import MvAppMobileNav from './MvAppMobileNav.vue';
import type { AppMobileNavItem } from './MvAppMobileNav.vue';

const ITEMS: AppMobileNavItem[] = [
    { key: 'home', label: 'Home', path: '/', icon: 'home' },
    { key: 'customers', label: 'Customers', path: '/customers', icon: 'customers' },
    { key: 'orders', label: 'Orders', path: '/orders', icon: 'orders', badgeCount: 2 },
    { key: 'approvals', label: 'Approvals', path: '/approvals', icon: 'approvals' },
    { key: 'more', label: 'More', icon: 'more' },
];

const meta: Meta<typeof MvAppMobileNav> = {
    title: 'Organisms/MvAppMobileNav',
    component: MvAppMobileNav,
    tags: ['autodocs'],
    args: { items: ITEMS, activePath: '/' },
    parameters: { viewport: { defaultViewport: 'mvMobile' } },
};

export default meta;
type Story = StoryObj<typeof MvAppMobileNav>;

export const Default: Story = {
    render: args => ({
        components: { MvAppMobileNav },
        setup: () => ({ args }),
        template: '<MvAppMobileNav v-bind="args" @select-more="() => {}" />',
    }),
};

export const OrdersActive: Story = {
    args: { activePath: '/orders' },
    render: args => ({
        components: { MvAppMobileNav },
        setup: () => ({ args }),
        template: '<MvAppMobileNav v-bind="args" @select-more="() => {}" />',
    }),
};
