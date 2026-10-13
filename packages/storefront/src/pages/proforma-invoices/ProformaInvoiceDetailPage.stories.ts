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

function mockProformaInvoice(displayStatus: string, extra: Record<string, unknown> = {}): void {
    registerMock('ProformaInvoiceDetail', () => ({
        proformaInvoice: {
            id: '1',
            number: '1000000001-01-1',
            issuedAt: '2026-10-13T09:00:00.000Z',
            dueDate: '2026-10-16T09:00:00.000Z',
            kind: 'order-placed',
            salesInvoiceNumber: null,
            version: 1,
            supersedes: null,
            supersededBy: null,
            orderChangedDifference: null,
            seller: {
                legalName: 'Demo Trading Co.',
                inn: '000000000000',
                legalAddress: '1 Demo Ave',
            },
            document: null,
            orderId: '1',
            organizationId: 'org-1',
            amount: 460000,
            currencyCode: 'RUB',
            displayStatus,
            ...extra,
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

export const Current: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            mockProformaInvoice('current');
            await router.push('/proforma-invoices/1');
        },
    ],
    render: () => ({
        components: { ProformaInvoiceDetailPage },
        template: '<ProformaInvoiceDetailPage />',
    }),
};

export const ByShipment: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            mockProformaInvoice('current', {
                kind: 'by-shipment',
                salesInvoiceNumber: 'R-0042',
                version: 3,
            });
            await router.push('/proforma-invoices/1');
        },
    ],
    render: () => ({
        components: { ProformaInvoiceDetailPage },
        template: '<ProformaInvoiceDetailPage />',
    }),
};

export const Superseded: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            mockProformaInvoice('superseded', {
                supersededBy: { id: '2', number: '1000000001-01-2', version: 2 },
            });
            await router.push('/proforma-invoices/1');
        },
    ],
    render: () => ({
        components: { ProformaInvoiceDetailPage },
        template: '<ProformaInvoiceDetailPage />',
    }),
};

export const CurrentThenOrderChanged: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            mockProformaInvoice('current', { orderChangedDifference: 120000 });
            await router.push('/proforma-invoices/1');
        },
    ],
    render: () => ({
        components: { ProformaInvoiceDetailPage },
        template: '<ProformaInvoiceDetailPage />',
    }),
};
