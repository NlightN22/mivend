import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { paginate } from '../../../.storybook/mock-list-utils';
import InvoicesPage from './InvoicesPage.vue';

const meta: Meta<typeof InvoicesPage> = {
    title: 'Pages/Invoices/InvoicesPage',
    component: InvoicesPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof InvoicesPage>;

const INVOICES = [
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
    {
        id: '3',
        orderId: '3',
        counterpartyId: '1',
        amount: 78000,
        currencyCode: 'RUB',
        status: 'overdue',
        branchId: 'branch-b',
    },
    {
        id: '4',
        orderId: '4',
        counterpartyId: '3',
        amount: 315000,
        currencyCode: 'RUB',
        status: 'issued',
        branchId: 'branch-b',
    },
    {
        id: '5',
        orderId: '5',
        counterpartyId: '2',
        amount: 54000,
        currencyCode: 'RUB',
        status: 'paid',
        branchId: 'branch-a',
    },
    {
        id: '6',
        orderId: '6',
        counterpartyId: '3',
        amount: 96000,
        currencyCode: 'RUB',
        status: 'cancelled',
        branchId: 'branch-b',
    },
];

interface InvoicesPageVariables {
    options?: { skip?: number; take?: number; status?: string };
    counterpartyId?: string;
}

function mockInvoicesData(): void {
    registerMock('InvoicesPage', (variables: InvoicesPageVariables) => {
        let filtered = INVOICES;
        if (variables.options?.status) {
            filtered = filtered.filter(i => i.status === variables.options!.status);
        }
        if (variables.counterpartyId) {
            filtered = filtered.filter(i => i.counterpartyId === variables.counterpartyId);
        }
        return { visibleInvoices: paginate(filtered, variables.options) };
    });
}

export const Default: Story = {
    loaders: [
        async () => {
            mockInvoicesData();
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
            registerMock('InvoicesPage', () => ({ visibleInvoices: { items: [], totalItems: 0 } }));
            await router.push('/invoices');
        },
    ],
    render: () => ({
        components: { InvoicesPage },
        template: '<InvoicesPage />',
    }),
};
