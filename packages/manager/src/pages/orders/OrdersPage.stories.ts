import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import OrdersPage from './OrdersPage.vue';

const meta: Meta<typeof OrdersPage> = {
    title: 'Pages/Orders/OrdersPage',
    component: OrdersPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof OrdersPage>;

const ORDER_ITEM = {
    id: '1',
    code: 'ORD-101',
    state: 'PaymentAuthorized',
    totalWithTax: 450000,
    currencyCode: 'RUB',
    orderPlacedAt: new Date().toISOString(),
    customFields: { reservationState: 'RESERVED' },
    customer: {
        firstName: 'Ivan',
        lastName: 'Petrov',
        counterparty: {
            shortName: 'customer-123',
            inn: '7701234567',
            priceType: 'price-type-wholesale',
            assignedManagerId: '1',
            branchId: 'branch-a',
        },
    },
};

function mockOrdersData(items: (typeof ORDER_ITEM)[], totalItems: number): void {
    registerMock('OrdersPage', () => ({
        visibleOrders: { totalItems, items },
    }));
    registerMock('OrdersSummary', () => ({
        open: { totalItems },
        overdue: { totalItems: 1 },
        today: {
            totalItems: 2,
            items: items.slice(0, 2).map(o => ({ totalWithTax: o.totalWithTax })),
        },
        processing: { totalItems: 1 },
        drafts: { totalItems: 0 },
        allOpen: { items },
        pendingPriceAdjustmentOrderIds: [],
    }));
    registerMock('TeamMembers', () => ({
        teamMembers: [{ id: '1', firstName: 'Alex', lastName: 'Manager', roleCodes: ['manager'] }],
    }));
    registerMock('Branches', () => ({
        branches: [{ erpId: 'branch-a', name: 'branch-a' }],
    }));
}

export const Default: Story = {
    loaders: [
        async () => {
            mockOrdersData(
                [
                    ORDER_ITEM,
                    {
                        ...ORDER_ITEM,
                        id: '2',
                        code: 'ORD-102',
                        state: 'PaymentSettled',
                        totalWithTax: 129000,
                        customer: {
                            ...ORDER_ITEM.customer,
                            firstName: 'Olga',
                            lastName: 'Sidorova',
                        },
                    },
                ],
                2,
            );
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
            mockOrdersData([], 0);
            await router.push('/orders');
        },
    ],
    render: () => ({
        components: { OrdersPage },
        template: '<OrdersPage />',
    }),
};
