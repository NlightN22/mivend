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

const CUSTOMERS = ['Customer One', 'Customer Two', 'Customer Three'];
const STATUSES = ['captured', 'pending', 'failed', 'captured', 'refunded'];
const CHANNELS = ['online-acquiring', 'branch-kassa', 'bank-transfer-erp'];

const PAYMENTS = Array.from({ length: 24 }, (_, i) => ({
    id: String(i + 1),
    number: String(2000 + i),
    createdAt: new Date(Date.now() - i * 86400000).toISOString(),
    providerPaymentId: `ext-${i + 1}`,
    channel: CHANNELS[i % 3],
    paymentStatus: STATUSES[i % 5],
    amount: 45000 + i * 12345,
    currencyCode: 'RUB',
    proformaInvoiceId: String(i + 1),
    counterpartyId: String((i % 3) + 1),
    counterpartyShortName: CUSTOMERS[i % 3],
    proformaInvoiceNumber: `${1000 + i}-01-1`,
    orderCode: String(1000 + i),
}));

interface PaymentsPageVariables {
    options?: { skip?: number; take?: number; status?: string; search?: string };
    counterpartyId?: string;
}

function mockPaymentsData(): void {
    registerMock('PaymentsPage', (variables: PaymentsPageVariables) => {
        let filtered = PAYMENTS;
        if (variables.options?.status) {
            filtered = filtered.filter(p => p.paymentStatus === variables.options!.status);
        }
        const term = variables.options?.search?.toLowerCase();
        if (term) {
            filtered = filtered.filter(
                p =>
                    p.number.includes(term) || p.counterpartyShortName.toLowerCase().includes(term),
            );
        }
        if (variables.counterpartyId) {
            filtered = filtered.filter(p => p.counterpartyId === variables.counterpartyId);
        }
        return { visiblePayments: paginate(filtered, variables.options) };
    });
    registerMock('PaymentViewCounts', () => ({
        all: { totalItems: 24 },
        captured: { totalItems: 10 },
        pending: { totalItems: 5 },
        failed: { totalItems: 5 },
        refunded: { totalItems: 4 },
    }));
    registerMock('TableViews', () => ({ tableViews: [] }));
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
