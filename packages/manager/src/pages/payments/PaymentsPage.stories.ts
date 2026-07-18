import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { paginate } from '../../../.storybook/mock-list-utils';
import PaymentsPage from './PaymentsPage.vue';

const meta: Meta<typeof PaymentsPage> = {
    title: 'Pages/Payments/PaymentsPage',
    component: PaymentsPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof PaymentsPage>;

const PAYMENTS = [
    {
        id: '1',
        channel: 'online-acquiring',
        paymentStatus: 'captured',
        amount: 450000,
        currencyCode: 'RUB',
        invoiceId: '1',
        counterpartyId: '1',
    },
    {
        id: '2',
        channel: 'branch-kassa',
        paymentStatus: 'pending',
        amount: 129000,
        currencyCode: 'RUB',
        invoiceId: '2',
        counterpartyId: '2',
    },
    {
        id: '3',
        channel: 'online-acquiring',
        paymentStatus: 'failed',
        amount: 78000,
        currencyCode: 'RUB',
        invoiceId: '3',
        counterpartyId: '1',
    },
    {
        id: '4',
        channel: 'bank-transfer',
        paymentStatus: 'captured',
        amount: 315000,
        currencyCode: 'RUB',
        invoiceId: '4',
        counterpartyId: '3',
    },
    {
        id: '5',
        channel: 'branch-kassa',
        paymentStatus: 'captured',
        amount: 54000,
        currencyCode: 'RUB',
        invoiceId: '5',
        counterpartyId: '2',
    },
    {
        id: '6',
        channel: 'online-acquiring',
        paymentStatus: 'refunded',
        amount: 96000,
        currencyCode: 'RUB',
        invoiceId: '6',
        counterpartyId: '3',
    },
];

interface PaymentsPageVariables {
    options?: { skip?: number; take?: number; status?: string; channel?: string };
    counterpartyId?: string;
}

function mockPaymentsData(): void {
    registerMock('PaymentsPage', (variables: PaymentsPageVariables) => {
        let filtered = PAYMENTS;
        if (variables.options?.status) {
            filtered = filtered.filter(p => p.paymentStatus === variables.options!.status);
        }
        if (variables.options?.channel) {
            filtered = filtered.filter(p => p.channel === variables.options!.channel);
        }
        if (variables.counterpartyId) {
            filtered = filtered.filter(p => p.counterpartyId === variables.counterpartyId);
        }
        return { visiblePayments: paginate(filtered, variables.options) };
    });
}

export const Default: Story = {
    loaders: [
        async () => {
            mockPaymentsData();
            await router.push('/payments');
        },
    ],
    render: () => ({
        components: { PaymentsPage },
        template: '<PaymentsPage />',
    }),
};

export const Empty: Story = {
    loaders: [
        async () => {
            registerMock('PaymentsPage', () => ({ visiblePayments: { items: [], totalItems: 0 } }));
            await router.push('/payments');
        },
    ],
    render: () => ({
        components: { PaymentsPage },
        template: '<PaymentsPage />',
    }),
};
