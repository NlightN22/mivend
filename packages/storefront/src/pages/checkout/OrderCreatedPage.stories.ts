import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import OrderCreatedPage from './OrderCreatedPage.vue';

// No 'autodocs': the combined Docs page renders every story's canvas at once, and each
// story's loader pushes a different route on the shared router singleton — the pushes
// collide and every canvas ends up on whichever route won last (see individual story
// canvases instead).
const meta: Meta<typeof OrderCreatedPage> = {
    title: 'Pages/Checkout/OrderCreatedPage',
    component: OrderCreatedPage,
};

export default meta;

function mockOrder(method: string, limitExceeded = false): void {
    registerMock('OrderCreated', () => ({
        orderByCode: {
            id: '10',
            code: 'ORD-SB-0001',
            orderPlacedAt: '2026-10-06T08:30:00.000Z',
            payments: [{ method, metadata: { public: { creditLimitExceeded: limitExceeded } } }],
            shippingLines: [{ shippingMethod: { name: 'Courier' } }],
            customFields: { tradingPointId: 'point-1' },
        },
        myTradingPoints: [{ id: 'point-1', name: 'Trading point A', address: 'branch-a address' }],
        myInvoices: { items: [{ id: '5', order: { code: 'ORD-SB-0001' } }] },
    }));
}
type Story = StoryObj<typeof OrderCreatedPage>;

export const Invoice: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            mockOrder('offline-terms');
            await router.push('/order-created?code=ORD-SB-0001');
        },
    ],
    render: () => ({
        components: { OrderCreatedPage },
        template: '<OrderCreatedPage />',
    }),
};

export const Deferred: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            mockOrder('deferred-payment');
            await router.push('/order-created?code=ORD-SB-0001');
        },
    ],
    render: () => ({
        components: { OrderCreatedPage },
        template: '<OrderCreatedPage />',
    }),
};

export const DeferredOverLimit: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            mockOrder('deferred-payment', true);
            await router.push('/order-created?code=ORD-SB-0001');
        },
    ],
    render: () => ({
        components: { OrderCreatedPage },
        template: '<OrderCreatedPage />',
    }),
};
