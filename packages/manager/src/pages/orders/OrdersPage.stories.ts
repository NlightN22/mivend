import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { mockOrdersList } from '../../components/orders/ordersListMocks';
import OrdersPage from './OrdersPage.vue';

const meta: Meta<typeof OrdersPage> = {
    title: 'Pages/Orders/OrdersPage',
    component: OrdersPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof OrdersPage>;

function mockOrdersData(): void {
    mockOrdersList();
    registerMock('OrdersViewCounts', () => ({
        all: { totalItems: 24 },
        awaitingConfirmation: { totalItems: 7 },
        processing: { totalItems: 2 },
        awaitingShipment: { totalItems: 5 },
        rejectedByErp: { totalItems: 0 },
        reservationFailed: { totalItems: 1 },
        erpRequirements: { totalItems: 0 },
        overdue: { totalItems: 3 },
        ordersAttention: { pendingPriceAdjustmentOrderIds: [] },
    }));
    registerMock('TableViews', () => ({ tableViews: [] }));
}

export const Default: Story = {
    loaders: [
        async () => {
            mockOrdersData();
            await router.push('/orders');
        },
    ],
    render: () => ({
        components: { OrdersPage },
        template: '<OrdersPage />',
    }),
};

export const Empty: Story = {
    loaders: [
        async () => {
            mockOrdersList([]);
            registerMock('OrdersViewCounts', () => ({
                all: { totalItems: 0 },
                awaitingConfirmation: { totalItems: 0 },
                processing: { totalItems: 0 },
                awaitingShipment: { totalItems: 0 },
                rejectedByErp: { totalItems: 0 },
                reservationFailed: { totalItems: 0 },
                erpRequirements: { totalItems: 0 },
                overdue: { totalItems: 0 },
                ordersAttention: { pendingPriceAdjustmentOrderIds: [] },
            }));
            registerMock('TableViews', () => ({ tableViews: [] }));
            await router.push('/orders');
        },
    ],
    render: () => ({
        components: { OrdersPage },
        template: '<OrdersPage />',
    }),
};

export const LoadFailed: Story = {
    loaders: [
        async () => {
            mockOrdersData();
            registerMock('OrdersPage', () => {
                throw new Error('Network error');
            });
            await router.push('/orders');
        },
    ],
    render: () => ({
        components: { OrdersPage },
        template: '<OrdersPage />',
    }),
};
