import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import InvoiceDetailPage from './InvoiceDetailPage.vue';

const meta: Meta<typeof InvoiceDetailPage> = {
    title: 'Pages/Invoices/InvoiceDetailPage',
    component: InvoiceDetailPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof InvoiceDetailPage>;

function mockInvoice(status: string): void {
    registerMock('InvoiceDetail', () => ({
        invoice: {
            id: '1',
            orderId: '1',
            organizationId: 'org-1',
            amount: 460000,
            currencyCode: 'RUB',
            status,
            order: { id: '1', code: 'ORD-101' },
            lines: [
                {
                    quantity: 2,
                    unitPriceWithTax: 220000,
                    linePriceWithTax: 440000,
                    productVariant: { name: 'Brake pad set', sku: 'sku-10021' },
                },
            ],
        },
    }));
}

export const Issued: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            mockInvoice('issued');
            await router.push('/invoices/1');
        },
    ],
    render: () => ({
        components: { InvoiceDetailPage },
        template: '<InvoiceDetailPage />',
    }),
};

export const Paid: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            mockInvoice('paid');
            await router.push('/invoices/1');
        },
    ],
    render: () => ({
        components: { InvoiceDetailPage },
        template: '<InvoiceDetailPage />',
    }),
};
