import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import ProformaInvoiceDetailPage from './ProformaInvoiceDetailPage.vue';

const meta: Meta<typeof ProformaInvoiceDetailPage> = {
    title: 'Pages/ProformaInvoices/ProformaInvoiceDetailPage',
    component: ProformaInvoiceDetailPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ProformaInvoiceDetailPage>;

const variant = (name: string, sku: string) => ({ name, sku });
const v1Lines = [
    {
        quantity: 2,
        linePriceWithTax: 200000,
        discountAmount: 0,
        productVariant: variant('Item A', 'A-1'),
    },
    {
        quantity: 1,
        linePriceWithTax: 90000,
        discountAmount: 9000,
        productVariant: variant('Item B', 'B-1'),
    },
];
const v2Lines = [
    {
        quantity: 3,
        linePriceWithTax: 300000,
        discountAmount: 0,
        productVariant: variant('Item A', 'A-1'),
    },
    ...v1Lines.slice(1),
];

const card = (over: Record<string, unknown>) => ({
    id: '2',
    number: '1000001-01-2',
    version: 2,
    kind: 'order-changed',
    displayStatus: 'current',
    status: 'issued',
    amount: 381000,
    issuedAt: '2026-11-02T10:00:00Z',
    dueDate: '2026-11-05T10:00:00Z',
    orderId: '1',
    counterpartyId: '1',
    counterpartyShortName: 'Customer One',
    currencyCode: 'RUB',
    salesInvoiceNumber: null,
    contractName: null,
    order: { id: '1', code: '1000001' },
    seller: { legalName: 'Seller Org', inn: '0000000000', kpp: '000000000' },
    document: { status: 'ready', pdfUrl: '/document-pdf/00000000-0000-4000-8000-000000000000' },
    lines: v2Lines.map(l => ({ ...l, unitPriceWithTax: l.linePriceWithTax / l.quantity })),
    payments: [
        {
            id: '1',
            number: '2000001',
            createdAt: '2026-11-03T10:00:00Z',
            channel: 'bank-transfer-erp',
            paymentStatus: 'captured',
            amount: 200000,
        },
    ],
    versions: [
        {
            id: '2',
            number: '1000001-01-2',
            version: 2,
            kind: 'order-changed',
            displayStatus: 'current',
            amount: 381000,
            issuedAt: '2026-11-02T10:00:00Z',
            lines: v2Lines,
        },
        {
            id: '1',
            number: '1000001-01-1',
            version: 1,
            kind: 'order-placed',
            displayStatus: 'superseded',
            amount: 281000,
            issuedAt: '2026-11-01T10:00:00Z',
            lines: v1Lines,
        },
    ],
    ...over,
});

function show(data: Record<string, unknown>): Story['loaders'] {
    return [
        async () => {
            registerMock('ProformaInvoiceCard', () => ({ proformaInvoice: card(data) }));
            await router.push('/proforma-invoices/2');
        },
    ];
}

const render: Story['render'] = () => ({
    components: { ProformaInvoiceDetailPage },
    template: '<ProformaInvoiceDetailPage />',
});

export const TwoVersions: Story = { loaders: show({}), render };

export const SingleVersionUnpaid: Story = {
    loaders: show({ payments: [], versions: [card({}).versions[0]] }),
    render,
};

export const Cancelled: Story = { loaders: show({ displayStatus: 'cancelled' }), render };

export const PdfBeingPrepared: Story = {
    loaders: show({ document: { status: 'pending', pdfUrl: null } }),
    render,
};

export const NotFound: Story = {
    loaders: [
        async () => {
            registerMock('ProformaInvoiceCard', () => ({ proformaInvoice: null }));
            await router.push('/proforma-invoices/999');
        },
    ],
    render,
};
