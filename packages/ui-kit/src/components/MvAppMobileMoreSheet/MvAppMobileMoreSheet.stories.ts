import type { Meta, StoryObj } from '@storybook/vue3';
import MvAppMobileMoreSheet from './MvAppMobileMoreSheet.vue';
import type { AppMobileSheetItem } from './MvAppMobileMoreSheet.vue';

const ITEMS: AppMobileSheetItem[] = [
    { key: 'discounts', label: 'Discounts', path: '/discounts' },
    { key: 'reports', label: 'Reports', path: '/reports' },
    { key: 'profile', label: 'Profile', path: '/profile' },
    { key: 'settings', label: 'Settings', path: '/settings' },
];

const meta: Meta<typeof MvAppMobileMoreSheet> = {
    title: 'Organisms/MvAppMobileMoreSheet',
    component: MvAppMobileMoreSheet,
    tags: ['autodocs'],
    args: {
        open: true,
        items: ITEMS,
        userName: 'Alex Ivanov',
        userRoleLabel: 'Manager',
        userInitials: 'AI',
    },
    parameters: { viewport: { defaultViewport: 'mvMobile' } },
};

export default meta;
type Story = StoryObj<typeof MvAppMobileMoreSheet>;

export const Default: Story = {
    render: args => ({
        components: { MvAppMobileMoreSheet },
        setup: () => ({ args }),
        template: '<MvAppMobileMoreSheet v-bind="args" @close="() => {}" @logout="() => {}" />',
    }),
};

export const NoProfile: Story = {
    args: { userName: undefined, userRoleLabel: undefined, userInitials: undefined },
    render: args => ({
        components: { MvAppMobileMoreSheet },
        setup: () => ({ args }),
        template: '<MvAppMobileMoreSheet v-bind="args" @close="() => {}" @logout="() => {}" />',
    }),
};
