import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import CheckoutPage from './CheckoutPage.vue';

const meta: Meta<typeof CheckoutPage> = {
    title: 'Pages/Checkout/CheckoutPage',
    component: CheckoutPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof CheckoutPage>;

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
            registerMock('MyTradingPointsForDeliverySelector', () => ({
                myTradingPoints: [
                    { id: 'point-1', name: 'Trading point A', address: 'branch-a address' },
                ],
            }));
            await router.push('/checkout');
        },
    ],
    render: () => ({
        components: { CheckoutPage },
        template: '<CheckoutPage />',
    }),
};
