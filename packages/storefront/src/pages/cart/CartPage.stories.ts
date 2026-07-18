import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import CartPage from './CartPage.vue';

const meta: Meta<typeof CartPage> = {
    title: 'Pages/Cart/CartPage',
    component: CartPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof CartPage>;

export const Default: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            registerMock('ActiveOrder', () => ({
                activeOrder: {
                    id: '1',
                    state: 'AddingItems',
                    totalWithTax: 460000,
                    subTotalWithTax: 440000,
                    lines: [
                        {
                            id: 'line-1',
                            quantity: 2,
                            linePrice: 400000,
                            linePriceWithTax: 440000,
                            unitPrice: 200000,
                            compareAtPrice: 250000,
                            tierProgress: null,
                            productVariant: {
                                id: 'var-1',
                                sku: 'sku-10021',
                                name: 'Brake pad set',
                                price: 220000,
                                currencyCode: 'RUB',
                                stockLevel: 'IN_STOCK',
                                customFields: { weight: 1.2 },
                                product: {
                                    id: 'prod-1',
                                    name: 'Brake pad set',
                                    slug: 'brake-pad-set',
                                    facetValues: [{ name: 'Brakes', facet: { code: 'category' } }],
                                },
                            },
                        },
                    ],
                },
            }));
            await router.push('/cart');
        },
    ],
    render: () => ({
        components: { CartPage },
        template: '<CartPage />',
    }),
};

export const Empty: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            registerMock('ActiveOrder', () => ({
                activeOrder: {
                    id: '1',
                    state: 'AddingItems',
                    totalWithTax: 0,
                    subTotalWithTax: 0,
                    lines: [],
                },
            }));
            await router.push('/cart');
        },
    ],
    render: () => ({
        components: { CartPage },
        template: '<CartPage />',
    }),
};
