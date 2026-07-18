import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import PaymentDetailPage from './PaymentDetailPage.vue';

// No 'autodocs': the combined Docs page renders every story's canvas at once, and each
// story's loader pushes a different route on the shared router singleton — the pushes
// collide and every canvas ends up on whichever route won last (see individual story
// canvases instead).
const meta: Meta<typeof PaymentDetailPage> = {
    title: 'Pages/Payments/PaymentDetailPage',
    component: PaymentDetailPage,
};

export default meta;
type Story = StoryObj<typeof PaymentDetailPage>;

const PAYMENT_DETAIL = {
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
};

export const Default: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            registerMock('PaymentDetail', () => ({ payment: PAYMENT_DETAIL }));
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
