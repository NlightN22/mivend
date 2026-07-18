import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import InvoicesPage from './InvoicesPage.vue';

const meta: Meta<typeof InvoicesPage> = {
    title: 'Pages/Invoices/InvoicesPage',
    component: InvoicesPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof InvoicesPage>;

function mockInvoicesData(items: unknown[], totalItems: number): void {
    registerMock('InvoicesPage', () => ({
        visibleInvoices: { totalItems, items },
    }));
}

export const Default: Story = {
    loaders: [
        async () => {
            mockInvoicesData(
                [
                    {
                        id: '1',
                        orderId: '1',
                        counterpartyId: '1',
                        amount: 450000,
                        currencyCode: 'RUB',
                        status: 'issued',
                        branchId: 'branch-a',
                    },
                    {
                        id: '2',
                        orderId: '2',
                        counterpartyId: '2',
                        amount: 129000,
                        currencyCode: 'RUB',
                        status: 'paid',
                        branchId: 'branch-a',
                    },
                ],
                2,
            );
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
            mockInvoicesData([], 0);
            await router.push('/invoices');
        },
    ],
    render: () => ({
        components: { InvoicesPage },
        template: '<InvoicesPage />',
    }),
};
