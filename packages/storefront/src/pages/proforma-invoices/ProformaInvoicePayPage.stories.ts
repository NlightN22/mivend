import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import ProformaInvoicePayPage from './ProformaInvoicePayPage.vue';

const meta: Meta<typeof ProformaInvoicePayPage> = {
    title: 'Pages/ProformaInvoices/ProformaInvoicePayPage',
    component: ProformaInvoicePayPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ProformaInvoicePayPage>;

export const Default: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            registerMock('ProformaInvoiceDetail', () => ({
                proformaInvoice: {
                    id: '1',
                    number: '1000000001-01',
                    orderId: '1',
                    organizationId: 'org-1',
                    amount: 460000,
                    currencyCode: 'RUB',
                    status: 'issued',
                    order: { id: '1', code: 'ORD-101' },
                    lines: [],
                },
            }));
            await router.push('/proforma-invoices/1/pay');
        },
    ],
    render: () => ({
        components: { ProformaInvoicePayPage },
        template: '<ProformaInvoicePayPage />',
    }),
};
