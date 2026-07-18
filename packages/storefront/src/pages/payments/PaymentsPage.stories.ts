import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import PaymentsPage from './PaymentsPage.vue';

const meta: Meta<typeof PaymentsPage> = {
    title: 'Pages/Payments/PaymentsPage',
    component: PaymentsPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof PaymentsPage>;

export const Default: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            registerMock('MyAdvanceBalance', () => ({
                myAdvanceBalance: [{ amount: 50000, currencyCode: 'RUB' }],
            }));
            registerMock('MyPayments', () => ({
                myPayments: {
                    items: [
                        {
                            id: '1',
                            amount: 460000,
                            currencyCode: 'RUB',
                            channel: 'online-acquiring',
                            status: 'captured',
                            createdAt: new Date().toISOString(),
                            invoiceId: '1',
                            order: { id: '1', code: 'ORD-101' },
                            allocations: [
                                { amount: 460000, isAdvance: false, invoice: { id: '1' } },
                            ],
                            refunds: [],
                        },
                    ],
                    totalItems: 1,
                },
            }));
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
            registerDefaultMocks();
            registerMock('MyAdvanceBalance', () => ({ myAdvanceBalance: [] }));
            registerMock('MyPayments', () => ({ myPayments: { items: [], totalItems: 0 } }));
            await router.push('/payments');
        },
    ],
    render: () => ({
        components: { PaymentsPage },
        template: '<PaymentsPage />',
    }),
};
