import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { paginate, includesCi } from '../../../.storybook/mock-list-utils';
import DiscountsPage from './DiscountsPage.vue';

const meta: Meta<typeof DiscountsPage> = {
    title: 'Pages/Discounts/DiscountsPage',
    component: DiscountsPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof DiscountsPage>;

const now = Date.now();

const DISCOUNTS = [
    {
        id: '1',
        approvalRequestId: '1',
        discountRuleId: '1',
        status: 'materialized',
        priceTypeCode: 'price-type-wholesale',
        facetCode: null,
        facetValueCode: null,
        percent: 10,
        validFrom: new Date(now).toISOString(),
        validTo: new Date(now + 30 * 86400000).toISOString(),
        justification: 'Seasonal promotion',
        counterpartyIds: ['1'],
    },
    {
        id: '2',
        approvalRequestId: '2',
        discountRuleId: '2',
        status: 'pending',
        priceTypeCode: 'price-type-retail',
        facetCode: 'brand',
        facetValueCode: 'brand-x',
        percent: 5,
        validFrom: new Date(now).toISOString(),
        validTo: new Date(now + 14 * 86400000).toISOString(),
        justification: 'New customer onboarding',
        counterpartyIds: ['2'],
    },
    {
        id: '3',
        approvalRequestId: '3',
        discountRuleId: '3',
        status: 'rejected',
        priceTypeCode: 'price-type-wholesale',
        facetCode: null,
        facetValueCode: null,
        percent: 15,
        validFrom: new Date(now - 60 * 86400000).toISOString(),
        validTo: new Date(now - 30 * 86400000).toISOString(),
        justification: 'Volume discount request',
        counterpartyIds: ['3'],
    },
    {
        id: '4',
        approvalRequestId: null,
        discountRuleId: '4',
        status: 'materialized',
        priceTypeCode: 'price-type-wholesale',
        facetCode: 'category',
        facetValueCode: 'category-tires',
        percent: 8,
        validFrom: new Date(now).toISOString(),
        validTo: new Date(now + 5 * 86400000).toISOString(),
        justification: 'ERP-pushed group discount',
        counterpartyIds: ['1', '2'],
    },
];

const CUSTOMERS = [
    {
        id: '1',
        shortName: 'customer-101',
        legalName: 'customer-101 LLC',
        inn: '7701234561',
        priceType: 'price-type-wholesale',
        assignedManagerId: '1',
        branchId: 'branch-a',
        erpGroupLabel: null,
        isActive: true,
        tradingPoints: [],
    },
    {
        id: '2',
        shortName: 'customer-102',
        legalName: 'customer-102 LLC',
        inn: '7701234562',
        priceType: 'price-type-retail',
        assignedManagerId: '1',
        branchId: 'branch-a',
        erpGroupLabel: null,
        isActive: true,
        tradingPoints: [],
    },
    {
        id: '3',
        shortName: 'customer-103',
        legalName: 'customer-103 LLC',
        inn: '7701234563',
        priceType: 'price-type-wholesale',
        assignedManagerId: '2',
        branchId: 'branch-b',
        erpGroupLabel: null,
        isActive: true,
        tradingPoints: [],
    },
];

interface DiscountsPageVariables {
    options?: {
        skip?: number;
        take?: number;
        search?: string;
        priceTypeCode?: string;
        status?: string;
    };
}

function mockDiscountsData(): void {
    registerMock('DiscountRegistryPage', (variables: DiscountsPageVariables) => {
        let filtered = DISCOUNTS;
        const o = variables.options;
        if (o?.priceTypeCode) filtered = filtered.filter(d => d.priceTypeCode === o.priceTypeCode);
        if (o?.status) filtered = filtered.filter(d => d.status === o.status);
        if (o?.search) {
            filtered = filtered.filter(d => includesCi(d.justification, o.search!));
        }
        return { discountRegistryPage: paginate(filtered, o) };
    });
    registerMock('CustomersPage', () => ({
        counterparties: { items: CUSTOMERS, totalItems: CUSTOMERS.length },
    }));
    registerMock('PriceTypeCodes', () => ({
        priceTypeCodes: ['price-type-wholesale', 'price-type-retail'],
    }));
}

export const Default: Story = {
    loaders: [
        async () => {
            mockDiscountsData();
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
            registerMock('DiscountRegistryPage', () => ({
                discountRegistryPage: { items: [], totalItems: 0 },
            }));
            registerMock('CustomersPage', () => ({
                counterparties: { items: [], totalItems: 0 },
            }));
            registerMock('PriceTypeCodes', () => ({
                priceTypeCodes: ['price-type-wholesale', 'price-type-retail'],
            }));
            await router.push('/discounts');
        },
    ],
    render: () => ({
        components: { DiscountsPage },
        template: '<DiscountsPage />',
    }),
};
