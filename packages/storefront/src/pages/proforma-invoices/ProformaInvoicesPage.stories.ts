import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import ProformaInvoicesPage from './ProformaInvoicesPage.vue';

const meta: Meta<typeof ProformaInvoicesPage> = {
    title: 'Pages/ProformaInvoices/ProformaInvoicesPage',
    component: ProformaInvoicesPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ProformaInvoicesPage>;

export const Default: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            registerMock('MyProformaInvoices', () => ({
                myProformaInvoices: {
                    items: [
                        {
                            id: '1',
                            number: '1000000001-01',
                            orderId: '1',
                            organizationId: 'org-1',
                            amount: 460000,
                            currencyCode: 'RUB',
                            displayStatus: 'current',
                            issuedAt: '2026-10-13T09:00:00.000Z',
                            dueDate: '2026-10-16T09:00:00.000Z',
                            order: { id: '1', code: 'ORD-101' },
                        },
                        {
                            id: '2',
                            number: '1000000002-01',
                            orderId: '2',
                            organizationId: 'org-1',
                            amount: 129000,
                            currencyCode: 'RUB',
                            displayStatus: 'superseded',
                            issuedAt: '2026-10-10T09:00:00.000Z',
                            dueDate: '2026-10-13T09:00:00.000Z',
                            order: { id: '2', code: 'ORD-102' },
                        },
                    ],
                    totalItems: 2,
                },
            }));
            await router.push('/proforma-invoices');
        },
    ],
    render: () => ({
        components: { ProformaInvoicesPage },
        template: '<ProformaInvoicesPage />',
    }),
};

export const Empty: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            registerMock('MyProformaInvoices', () => ({
                myProformaInvoices: { items: [], totalItems: 0 },
            }));
            await router.push('/proforma-invoices');
        },
    ],
    render: () => ({
        components: { ProformaInvoicesPage },
        template: '<ProformaInvoicesPage />',
    }),
};
