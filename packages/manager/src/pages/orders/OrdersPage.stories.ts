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
    registerMock('OrdersSummary', () => ({
        open: { totalItems: 24 },
        overdue: { totalItems: 1 },
        today: { totalItems: 2 },
        todayAmount: 180000,
        openAmount: 1200000,
        processing: { totalItems: 2 },
        drafts: { totalItems: 0 },
        ordersAttention: {
            pendingPriceAdjustmentOrderIds: [],
            waiting: { totalItems: 0, items: [] },
            overdueRows: { items: [] },
            both: { totalItems: 0 },
        },
    }));
    registerMock('MyTableViews', () => ({ myTableViews: [] }));
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
            registerMock('OrdersSummary', () => ({
                open: { totalItems: 0 },
                overdue: { totalItems: 0 },
                today: { totalItems: 0 },
                todayAmount: 0,
                openAmount: 0,
                processing: { totalItems: 0 },
                drafts: { totalItems: 0 },
                ordersAttention: {
                    pendingPriceAdjustmentOrderIds: [],
                    waiting: { totalItems: 0, items: [] },
                    overdueRows: { items: [] },
                    both: { totalItems: 0 },
                },
            }));
            registerMock('MyTableViews', () => ({ myTableViews: [] }));
            await router.push('/orders');
        },
    ],
    render: () => ({
        components: { OrdersPage },
        template: '<OrdersPage />',
    }),
};
