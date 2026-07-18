import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import PaymentDetailPage from './PaymentDetailPage.vue';

const meta: Meta<typeof PaymentDetailPage> = {
    title: 'Pages/Payments/PaymentDetailPage',
    component: PaymentDetailPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof PaymentDetailPage>;

export const Default: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            registerMock('PaymentDetail', () => ({
                payment: {
                    id: '1',
                    amount: 460000,
                    currencyCode: 'RUB',
                    channel: 'online-acquiring',
                    status: 'captured',
                    createdAt: new Date().toISOString(),
                    invoiceId: '1',
                    orderId: '1',
                    externalReference: 'ext-ref-001',
                    refunds: [],
                    disputes: [],
                    processingEvents: [
                        { stage: 'received', occurredAt: new Date().toISOString(), note: null },
                        { stage: 'captured', occurredAt: new Date().toISOString(), note: null },
                    ],
                    invoice: { id: '1', status: 'paid' },
                    order: { id: '1', code: 'ORD-101' },
                    allocations: [
                        {
                            amount: 460000,
                            isAdvance: false,
                            invoice: {
                                id: '1',
                                amount: 460000,
                                currencyCode: 'RUB',
                                status: 'paid',
                                order: { id: '1', code: 'ORD-101' },
                            },
                        },
                    ],
                },
            }));
            await router.push('/payments/1');
        },
    ],
    render: () => ({
        components: { PaymentDetailPage },
        template: '<PaymentDetailPage />',
    }),
};

export const NotFound: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            registerMock('PaymentDetail', () => ({ payment: null }));
            await router.push('/payments/999');
        },
    ],
    render: () => ({
        components: { PaymentDetailPage },
        template: '<PaymentDetailPage />',
    }),
};
