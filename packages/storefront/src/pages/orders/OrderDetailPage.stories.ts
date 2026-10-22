import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import OrderDetailPage from './OrderDetailPage.vue';

// No autodocs: each story's loader pushes a route on the shared router singleton, and
// the combined Docs page renders all stories at once, so the pushes collide.
const meta: Meta<typeof OrderDetailPage> = {
    title: 'Pages/Orders/OrderDetailPage',
    component: OrderDetailPage,
};

export default meta;
type Story = StoryObj<typeof OrderDetailPage>;

export const Default: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            registerMock('OrderDetail', () => ({
                order: {
                    id: '1',
                    code: 'ORD-101',
                    state: 'PaymentAuthorized',
                    createdAt: new Date().toISOString(),
                    totalWithTax: 460000,
                    subTotalWithTax: 440000,
                    shippingWithTax: 20000,
                    currencyCode: 'RUB',
                    lines: [
                        {
                            id: 'line-1',
                            quantity: 2,
                            discountedUnitPriceWithTax: 220000,
                            discountedLinePriceWithTax: 440000,
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
                        streetLine2: null,
                        city: 'branch-a',
                        postalCode: '100000',
                        country: 'RU',
                    },
                    customFields: {
                        erpStatus: 'CONFIRMED',
                        erpStatusAt: new Date().toISOString(),
                    },
                },
            }));
            await router.push('/orders/1');
        },
    ],
    render: () => ({
        components: { OrderDetailPage },
        template: '<OrderDetailPage />',
    }),
};

export const PartiallyPaid: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            registerMock('OrderDetail', () => ({
                order: {
                    id: '1',
                    code: 'ORD-102',
                    state: 'PaymentAuthorized',
                    createdAt: new Date().toISOString(),
                    totalWithTax: 460000,
                    subTotalWithTax: 440000,
                    shippingWithTax: 20000,
                    currencyCode: 'RUB',
                    lines: [],
                    shippingAddress: null,
                    customFields: { erpStatus: 'CONFIRMED', erpPaidAmount: 200000 },
                },
            }));
            await router.push('/orders/1');
        },
    ],
    render: () => ({
        components: { OrderDetailPage },
        template: '<OrderDetailPage />',
    }),
};

export const Overpaid: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            registerMock('OrderDetail', () => ({
                order: {
                    id: '1',
                    code: 'ORD-103',
                    state: 'PaymentAuthorized',
                    createdAt: new Date().toISOString(),
                    totalWithTax: 460000,
                    subTotalWithTax: 440000,
                    shippingWithTax: 20000,
                    currencyCode: 'RUB',
                    lines: [],
                    shippingAddress: null,
                    customFields: { erpStatus: 'CONFIRMED', erpPaidAmount: 500000 },
                },
            }));
            await router.push('/orders/1');
        },
    ],
    render: () => ({
        components: { OrderDetailPage },
        template: '<OrderDetailPage />',
    }),
};

export const NotFound: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            registerMock('OrderDetail', () => ({ order: null }));
            await router.push('/orders/999');
        },
    ],
    render: () => ({
        components: { OrderDetailPage },
        template: '<OrderDetailPage />',
    }),
};
