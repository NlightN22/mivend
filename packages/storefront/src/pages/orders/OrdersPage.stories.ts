import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import { buildOrder } from '../../../.storybook/fixtures';
import OrdersPage from './OrdersPage.vue';

const meta: Meta<typeof OrdersPage> = {
    title: 'Pages/Orders/OrdersPage',
    component: OrdersPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof OrdersPage>;

function mockOrdersAside(): void {
    registerMock('MyAdvanceBalance', () => ({
        myAdvanceBalance: [{ amount: 50000, currencyCode: 'RUB' }],
    }));
    registerMock('MyInvoices', () => ({
        myInvoices: { items: [], totalItems: 0 },
    }));
}

export const Default: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            mockOrdersAside();
            registerMock('MyOrders', () => ({
                myOrders: {
                    items: [
                        buildOrder({
                            id: '1',
                            code: 'ORD-101',
                            state: 'PaymentAuthorized',
                            createdAt: new Date().toISOString(),
                            lines: [
                                {
                                    id: 'line-1',
                                    quantity: 2,
                                    linePriceWithTax: 460000,
                                    productVariant: {
                                        id: 'var-1',
                                        sku: 'sku-10021',
                                        name: 'Brake pad set',
                                        product: { name: 'Brake pad set', slug: 'brake-pad-set' },
                                    },
                                },
                            ],
                            shippingAddress: {
                                fullName: 'Ivan Petrov',
                                streetLine1: 'branch-a address',
                                city: 'branch-a',
                            },
                            customFields: {
                                erpStatus: 'CONFIRMED',
                                erpOrderId: 'erp-1',
                                erpStatusAt: new Date().toISOString(),
                            },
                        }),
                        buildOrder({
                            id: '2',
                            code: 'ORD-102',
                            state: 'PaymentSettled',
                            createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
                            lines: [],
                            shippingAddress: null,
                            customFields: {
                                erpStatus: 'SHIPPED',
                                erpOrderId: 'erp-2',
                                erpStatusAt: new Date().toISOString(),
                            },
                        }),
                    ],
                    totalItems: 2,
                },
            }));
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
            registerDefaultMocks();
            mockOrdersAside();
            registerMock('MyOrders', () => ({ myOrders: { items: [], totalItems: 0 } }));
            await router.push('/orders');
        },
    ],
    render: () => ({
        components: { OrdersPage },
        template: '<OrdersPage />',
    }),
};
