import type { Meta, StoryObj } from '@storybook/vue3';
import MvBreadcrumbs from './MvBreadcrumbs.vue';

const meta: Meta<typeof MvBreadcrumbs> = {
    title: 'Molecules/MvBreadcrumbs',
    component: MvBreadcrumbs,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof MvBreadcrumbs>;

export const Default: Story = {
    args: {
        items: [
            { label: 'Catalog', to: '/catalog' },
            { label: 'Brake system', to: '/catalog/brake-system' },
            { label: 'Brake pad set' },
        ],
    },
    render: args => ({
        components: { MvBreadcrumbs },
        setup: () => ({ args }),
        template: '<MvBreadcrumbs v-bind="args" />',
    }),
};

export const SingleLevel: Story = {
    args: { items: [{ label: 'Dashboard' }] },
    render: args => ({
        components: { MvBreadcrumbs },
        setup: () => ({ args }),
        template: '<MvBreadcrumbs v-bind="args" />',
    }),
};

export const DeepPath: Story = {
    args: {
        items: [
            { label: 'Customers', to: '/customers' },
            { label: 'customer-123', to: '/customers/customer-123' },
            { label: 'Orders', to: '/customers/customer-123/orders' },
            { label: 'order-9001' },
        ],
    },
    render: args => ({
        components: { MvBreadcrumbs },
        setup: () => ({ args }),
        template: '<MvBreadcrumbs v-bind="args" />',
    }),
};
