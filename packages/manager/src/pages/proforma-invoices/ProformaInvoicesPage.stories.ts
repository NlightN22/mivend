import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { paginate } from '../../../.storybook/mock-list-utils';
import ProformaInvoicesPage from './ProformaInvoicesPage.vue';

const meta: Meta<typeof ProformaInvoicesPage> = {
    title: 'Pages/ProformaInvoices/ProformaInvoicesPage',
    component: ProformaInvoicesPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ProformaInvoicesPage>;

const PROFORMA_INVOICES = [
    {
        id: '1',
        orderId: '1',
        counterpartyId: '1',
        amount: 450000,
        currencyCode: 'RUB',
        displayStatus: 'current',
        branchId: 'branch-a',
    },
    {
        id: '2',
        orderId: '2',
        counterpartyId: '2',
        amount: 129000,
        currencyCode: 'RUB',
        displayStatus: 'current',
        branchId: 'branch-a',
    },
    {
        id: '3',
        orderId: '3',
        counterpartyId: '1',
        amount: 78000,
        currencyCode: 'RUB',
        displayStatus: 'superseded',
        branchId: 'branch-b',
    },
    {
        id: '4',
        orderId: '4',
        counterpartyId: '3',
        amount: 315000,
        currencyCode: 'RUB',
        displayStatus: 'current',
        branchId: 'branch-b',
    },
    {
        id: '5',
        orderId: '5',
        counterpartyId: '2',
        amount: 54000,
        currencyCode: 'RUB',
        displayStatus: 'current',
        branchId: 'branch-a',
    },
    {
        id: '6',
        orderId: '6',
        counterpartyId: '3',
        amount: 96000,
        currencyCode: 'RUB',
        displayStatus: 'cancelled',
        branchId: 'branch-b',
    },
];

interface ProformaInvoicesPageVariables {
    options?: { skip?: number; take?: number; status?: string };
    counterpartyId?: string;
}

function mockProformaInvoicesData(): void {
    registerMock('ProformaInvoicesPage', (variables: ProformaInvoicesPageVariables) => {
        let filtered = PROFORMA_INVOICES;
        if (variables.options?.status) {
            filtered = filtered.filter(i => i.displayStatus === variables.options!.status);
        }
        if (variables.counterpartyId) {
            filtered = filtered.filter(i => i.counterpartyId === variables.counterpartyId);
        }
        return { visibleProformaInvoices: paginate(filtered, variables.options) };
    });
}

export const Default: Story = {
    loaders: [
        async () => {
            mockProformaInvoicesData();
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
            registerMock('ProformaInvoicesPage', () => ({
                visibleProformaInvoices: { items: [], totalItems: 0 },
            }));
            await router.push('/proforma-invoices');
        },
    ],
    render: () => ({
        components: { ProformaInvoicesPage },
        template: '<ProformaInvoicesPage />',
    }),
};
