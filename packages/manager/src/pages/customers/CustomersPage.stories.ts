import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import CustomersPage from './CustomersPage.vue';

const meta: Meta<typeof CustomersPage> = {
    title: 'Pages/Customers/CustomersPage',
    component: CustomersPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof CustomersPage>;

const CUSTOMER_ITEM = {
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
                { name: 'Ivan Petrov', phone: '+7 913 000-00-11', email: null, isPrimary: true },
            ],
        },
    ],
};

function mockCustomersData(items: (typeof CUSTOMER_ITEM)[], totalItems: number): void {
    registerMock('CustomersPage', () => ({
        counterparties: { items, totalItems },
    }));
    registerMock('CustomersSummary', () => ({
        counterpartySummary: {
            totalCount: totalItems,
            activeCount: totalItems,
            totalCreditBalance: 1000000,
            highUsageCount: 1,
        },
    }));
    registerMock('Branches', () => ({ branches: [{ erpId: 'branch-a', name: 'branch-a' }] }));
    registerMock('TeamMembers', () => ({
        teamMembers: [{ id: '1', firstName: 'Alex', lastName: 'Manager', roleCodes: ['manager'] }],
    }));
    registerMock('ExpiringDiscountGrants', () => ({ expiringDiscountGrants: [] }));
    registerMock('ActiveDiscountCountForCounterparty', () => ({
        discountGrantsForCounterparty: [],
    }));
    registerMock('LastOrderDates', () => ({ visibleOrders: { items: [] } }));
}

export const Default: Story = {
    loaders: [
        async () => {
            mockCustomersData(
                [CUSTOMER_ITEM, { ...CUSTOMER_ITEM, id: '2', shortName: 'customer-124' }],
                2,
            );
            await router.push('/customers');
        },
    ],
    render: () => ({
        components: { CustomersPage },
        template: '<CustomersPage />',
    }),
};

export const Empty: Story = {
    loaders: [
        async () => {
            mockCustomersData([], 0);
            await router.push('/customers');
        },
    ],
    render: () => ({
        components: { CustomersPage },
        template: '<CustomersPage />',
    }),
};
