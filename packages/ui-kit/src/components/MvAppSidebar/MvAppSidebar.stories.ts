import type { Meta, StoryObj } from '@storybook/vue3';
import MvAppSidebar from './MvAppSidebar.vue';
import type { AppSidebarItem } from './sidebar-items';

const ITEMS: AppSidebarItem[] = [
    { label: 'Dashboard', path: '/' },
    { label: 'Customers', path: '/customers' },
    {
        label: 'Documents',
        children: [
            { label: 'Orders', path: '/orders' },
            { label: 'Proforma invoices', path: '/proforma-invoices' },
            { label: 'Discount requests', path: '/discounts', badgeCount: 2 },
        ],
    },
    { label: 'Approvals', path: '/approvals', badgeCount: 4 },
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
