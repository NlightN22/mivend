import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import OrderCreatePage from './OrderCreatePage.vue';

const meta: Meta<typeof OrderCreatePage> = {
    title: 'Pages/Orders/OrderCreatePage',
    component: OrderCreatePage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof OrderCreatePage>;

function mockOrderCreateData(): void {
    registerMock('OrderCreateCounterparties', () => ({
        counterparties: {
            items: [
                {
                    id: '2',
                    shortName: 'customer-124',
                    legalName: 'customer-124 LLC',
                    inn: '7701234568',
                    priceType: 'price-type-wholesale',
                    linkedCustomerId: null,
                    tradingPoints: [],
                },
                {
                    id: '1',
                    shortName: 'customer-123',
                    legalName: 'customer-123 LLC',
                    inn: '7701234567',
                    priceType: 'price-type-wholesale',
                    linkedCustomerId: '1',
                    tradingPoints: [
                        {
                            id: '1',
                            name: 'Main point',
                            address: 'branch-a, 1st line',
                            isActive: true,
                            customerStatus: 'active',
                        },
                    ],
                },
            ],
        },
    }));
}

export const Default: Story = {
    loaders: [
        async () => {
            mockOrderCreateData();
            await router.push('/orders/new');
        },
    ],
    render: () => ({
        components: { OrderCreatePage },
        template: '<OrderCreatePage />',
    }),
};
