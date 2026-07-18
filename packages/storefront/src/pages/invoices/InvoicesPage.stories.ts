import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import InvoicesPage from './InvoicesPage.vue';

const meta: Meta<typeof InvoicesPage> = {
    title: 'Pages/Invoices/InvoicesPage',
    component: InvoicesPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof InvoicesPage>;

export const Default: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            registerMock('MyInvoices', () => ({
                myInvoices: {
                    items: [
                        {
                            id: '1',
                            orderId: '1',
                            organizationId: 'org-1',
                            amount: 460000,
                            currencyCode: 'RUB',
                            status: 'issued',
                            order: { id: '1', code: 'ORD-101' },
                        },
                        {
                            id: '2',
                            orderId: '2',
                            organizationId: 'org-1',
                            amount: 129000,
                            currencyCode: 'RUB',
                            status: 'paid',
                            order: { id: '2', code: 'ORD-102' },
                        },
                    ],
                    totalItems: 2,
                },
            }));
            await router.push('/invoices');
        },
    ],
    render: () => ({
        components: { InvoicesPage },
        template: '<InvoicesPage />',
    }),
};

export const Empty: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            registerMock('MyInvoices', () => ({ myInvoices: { items: [], totalItems: 0 } }));
            await router.push('/invoices');
        },
    ],
    render: () => ({
        components: { InvoicesPage },
        template: '<InvoicesPage />',
    }),
};
