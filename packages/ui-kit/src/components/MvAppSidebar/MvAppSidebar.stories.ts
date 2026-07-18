import type { Meta, StoryObj } from '@storybook/vue3';
import MvAppSidebar from './MvAppSidebar.vue';
import type { AppSidebarItem } from './MvAppSidebar.vue';

const ITEMS: AppSidebarItem[] = [
    { label: 'Dashboard', path: '/' },
    { label: 'Customers', path: '/customers' },
    { label: 'Orders', path: '/orders' },
    { label: 'Approvals', path: '/approvals', badgeCount: 4 },
    { label: 'Discounts', path: '/discounts' },
];

const meta: Meta<typeof MvAppSidebar> = {
    title: 'Organisms/MvAppSidebar',
    component: MvAppSidebar,
    tags: ['autodocs'],
    argTypes: {
        sectionTitle: { control: 'text' },
    },
    args: { items: ITEMS, sectionTitle: 'Workspace' },
};

export default meta;
type Story = StoryObj<typeof MvAppSidebar>;

export const Default: Story = {
    render: args => ({
        components: { MvAppSidebar },
        setup: () => ({ args }),
        template: '<div style="height: 480px;"><MvAppSidebar v-bind="args" /></div>',
    }),
};

export const NoSectionTitle: Story = {
    args: { sectionTitle: '' },
    render: args => ({
        components: { MvAppSidebar },
        setup: () => ({ args }),
        template: '<div style="height: 480px;"><MvAppSidebar v-bind="args" /></div>',
    }),
};
