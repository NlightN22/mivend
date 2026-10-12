import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import ProformaInvoiceDetailPage from './ProformaInvoiceDetailPage.vue';

const meta: Meta<typeof ProformaInvoiceDetailPage> = {
    title: 'Pages/ProformaInvoices/ProformaInvoiceDetailPage',
    component: ProformaInvoiceDetailPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ProformaInvoiceDetailPage>;

function mockProformaInvoice(status: string): void {
    registerMock('ProformaInvoiceDetail', () => ({
        proformaInvoice: {
            id: '1',
            number: '1000000001-01',
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
            mockProformaInvoice('issued');
            await router.push('/proforma-invoices/1');
        },
    ],
    render: () => ({
        components: { ProformaInvoiceDetailPage },
        template: '<ProformaInvoiceDetailPage />',
    }),
};

export const Paid: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            mockProformaInvoice('paid');
            await router.push('/proforma-invoices/1');
        },
    ],
    render: () => ({
        components: { ProformaInvoiceDetailPage },
        template: '<ProformaInvoiceDetailPage />',
    }),
};
