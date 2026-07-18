import type { Meta, StoryObj } from '@storybook/vue3';
import CustomerOrdersTab from './CustomerOrdersTab.vue';
import type { CustomerOrderItem } from '../../api/customers';

const ORDERS: CustomerOrderItem[] = [
    {
        code: 'ORD-202607-8F00CFB',
        state: 'ArrangingPayment',
        totalWithTax: 445464,
        currencyCode: 'USD',
        orderPlacedAt: new Date().toISOString(),
    },
    {
        code: 'ORD-202607-41E8A3F3',
        state: 'PaymentSettled',
        totalWithTax: 184220,
        currencyCode: 'USD',
        orderPlacedAt: new Date(Date.now() - 86400000).toISOString(),
    },
    {
        code: 'ORD-202607-7910EC4D',
        state: 'PaymentAuthorized',
        totalWithTax: 322800,
        currencyCode: 'USD',
        orderPlacedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
    {
        code: 'ORD-202607-3A1C0FB6',
        state: 'Draft',
        totalWithTax: 168750,
        currencyCode: 'USD',
        orderPlacedAt: null,
    },
];

const meta: Meta<typeof CustomerOrdersTab> = {
    title: 'Components/Customers/CustomerOrdersTab',
    component: CustomerOrdersTab,
    tags: ['autodocs'],
    args: { orders: ORDERS },
};

export default meta;
type Story = StoryObj<typeof CustomerOrdersTab>;

export const Default: Story = {};

export const Empty: Story = {
    args: { orders: [] },
};

// See AGENTS.md's "Manager portal rules" tab-overflow pattern discussion — this tab is the
// current baseline being redesigned against tasks/design/manager_portal/
// mivend_customer_orders_concept_v5.html; keep a mobile bookmark to compare against the
// concept's mobile card layout as the redesign lands.
export const Mobile: Story = {
    parameters: { viewport: { defaultViewport: 'mvMobile' } },
};
