import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import DiscountsPage from './DiscountsPage.vue';

const meta: Meta<typeof DiscountsPage> = {
    title: 'Pages/Discounts/DiscountsPage',
    component: DiscountsPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof DiscountsPage>;

function mockDiscountsData(items: unknown[], totalItems: number): void {
    registerMock('DiscountRegistryPage', () => ({
        discountRegistryPage: { items, totalItems },
    }));
    registerMock('CustomersPage', () => ({
        counterparties: {
            items: [
                {
                    id: '1',
                    shortName: 'customer-123',
                    legalName: 'customer-123 LLC',
                    inn: '7701234567',
                    priceType: 'price-type-wholesale',
                    assignedManagerId: '1',
                    branchId: 'branch-a',
                    erpGroupLabel: null,
                    isActive: true,
                    tradingPoints: [
                        {
                            id: 'tp-1',
                            name: 'Trading point A',
                            address: 'branch-a address',
                            workingHours: '09:00-18:00',
                            deliveryComment: null,
                            isActive: true,
                            contacts: [
                                {
                                    name: 'Ivan Petrov',
                                    phone: '+7 913 000-00-11',
                                    email: null,
                                    isPrimary: true,
                                },
                            ],
                        },
                    ],
                },
            ],
            totalItems: 1,
        },
    }));
    registerMock('PriceTypeCodes', () => ({
        priceTypeCodes: ['price-type-wholesale', 'price-type-retail'],
    }));
}

export const Default: Story = {
    loaders: [
        async () => {
            mockDiscountsData(
                [
                    {
                        id: '1',
                        approvalRequestId: '1',
                        discountRuleId: '1',
                        status: 'materialized',
                        priceTypeCode: 'price-type-wholesale',
                        facetCode: null,
                        facetValueCode: null,
                        percent: 10,
                        validFrom: new Date().toISOString(),
                        validTo: new Date(Date.now() + 30 * 86400000).toISOString(),
                        justification: 'Seasonal promotion',
                        counterpartyIds: ['1'],
                    },
                ],
                1,
            );
            await router.push('/discounts');
        },
    ],
    render: () => ({
        components: { DiscountsPage },
        template: '<DiscountsPage />',
    }),
};

export const Empty: Story = {
    loaders: [
        async () => {
            mockDiscountsData([], 0);
            await router.push('/discounts');
        },
    ],
    render: () => ({
        components: { DiscountsPage },
        template: '<DiscountsPage />',
    }),
};
