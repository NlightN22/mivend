import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import PaymentsPage from './PaymentsPage.vue';

const meta: Meta<typeof PaymentsPage> = {
    title: 'Pages/Payments/PaymentsPage',
    component: PaymentsPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof PaymentsPage>;

function mockPaymentsData(items: unknown[], totalItems: number): void {
    registerMock('PaymentsPage', () => ({
        visiblePayments: { totalItems, items },
    }));
}

export const Default: Story = {
    loaders: [
        async () => {
            mockPaymentsData(
                [
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
                ],
                2,
            );
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
            mockPaymentsData([], 0);
            await router.push('/payments');
        },
    ],
    render: () => ({
        components: { PaymentsPage },
        template: '<PaymentsPage />',
    }),
};
