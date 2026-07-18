import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import OrderDetailPage from './OrderDetailPage.vue';

// No 'autodocs': the combined Docs page renders every story's canvas at once, and each
// story's loader pushes a different route on the shared router singleton — the pushes
// collide and every canvas ends up on whichever route won last (see individual story
// canvases instead).
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
                            unitPriceWithTax: 220000,
                            linePriceWithTax: 440000,
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
                        erpOrderId: 'erp-1',
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
