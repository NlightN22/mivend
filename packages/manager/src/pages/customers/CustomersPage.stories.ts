import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { paginate, includesCi } from '../../../.storybook/mock-list-utils';
import CustomersPage from './CustomersPage.vue';

const meta: Meta<typeof CustomersPage> = {
    title: 'Pages/Customers/CustomersPage',
    component: CustomersPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof CustomersPage>;

interface MockTradingPoint {
    id: string;
    name: string;
    address: string;
    workingHours: string;
    deliveryComment: null;
    isActive: boolean;
    contacts: { name: string; phone: string; email: null; isPrimary: boolean }[];
}

function tradingPoint(name: string): MockTradingPoint {
    return {
        id: `tp-${name}`,
        name,
        address: 'branch-a address',
        workingHours: '09:00-18:00',
        deliveryComment: null,
        isActive: true,
        contacts: [
            { name: 'Ivan Petrov', phone: '+7 913 000-00-11', email: null, isPrimary: true },
        ],
    };
}

const CUSTOMERS = [
    {
        id: '1',
        shortName: 'customer-101',
        legalName: 'customer-101 LLC',
        inn: '7701234561',
        priceType: 'price-type-wholesale',
        assignedManagerId: '1',
        branchId: 'branch-a',
        erpGroupLabel: 'group-auto-parts',
        isActive: true,
        tradingPoints: [tradingPoint('Trading point A')],
    },
    {
        id: '2',
        shortName: 'customer-102',
        legalName: 'customer-102 LLC',
        inn: '7701234562',
        priceType: 'price-type-retail',
        assignedManagerId: '1',
        branchId: 'branch-a',
        erpGroupLabel: 'group-tires',
        isActive: true,
        tradingPoints: [tradingPoint('Trading point B')],
    },
    {
        id: '3',
        shortName: 'customer-103',
        legalName: 'customer-103 LLC',
        inn: '7701234563',
        priceType: 'price-type-wholesale',
        assignedManagerId: '2',
        branchId: 'branch-b',
        erpGroupLabel: 'group-auto-parts',
        isActive: false,
        tradingPoints: [tradingPoint('Trading point C')],
    },
    {
        id: '4',
        shortName: 'customer-104',
        legalName: 'customer-104 LLC',
        inn: '7701234564',
        priceType: 'price-type-wholesale',
        assignedManagerId: '2',
        branchId: 'branch-b',
        erpGroupLabel: 'group-tires',
        isActive: true,
        tradingPoints: [tradingPoint('Trading point D')],
    },
    {
        id: '5',
        shortName: 'customer-105',
        legalName: 'customer-105 LLC',
        inn: '7701234565',
        priceType: 'price-type-retail',
        assignedManagerId: null,
        branchId: 'branch-a',
        erpGroupLabel: null,
        isActive: true,
        tradingPoints: [tradingPoint('Trading point E')],
    },
    {
        id: '6',
        shortName: 'customer-106',
        legalName: 'customer-106 LLC',
        inn: '7701234566',
        priceType: 'price-type-wholesale',
        assignedManagerId: null,
        branchId: 'branch-b',
        erpGroupLabel: null,
        isActive: false,
        tradingPoints: [tradingPoint('Trading point F')],
    },
];

interface CustomersPageVariables {
    options?: {
        skip?: number;
        take?: number;
        search?: string;
        status?: 'active' | 'inactive';
        managerId?: string;
        branchId?: string;
        groupLabel?: string;
        unassignedOnly?: boolean;
    };
}

function mockCustomersData(): void {
    registerMock('CustomersPage', (variables: CustomersPageVariables) => {
        let filtered = CUSTOMERS;
        const o = variables.options;
        if (o?.search) {
            filtered = filtered.filter(
                c =>
                    includesCi(c.shortName, o.search!) ||
                    includesCi(c.legalName, o.search!) ||
                    includesCi(c.inn, o.search!),
            );
        }
        if (o?.status) filtered = filtered.filter(c => (o.status === 'active') === c.isActive);
        if (o?.branchId) filtered = filtered.filter(c => c.branchId === o.branchId);
        if (o?.groupLabel) filtered = filtered.filter(c => c.erpGroupLabel === o.groupLabel);
        if (o?.unassignedOnly) {
            filtered = filtered.filter(c => !c.assignedManagerId);
        } else if (o?.managerId) {
            filtered = filtered.filter(c => c.assignedManagerId === o.managerId);
        }
        return { counterparties: paginate(filtered, o) };
    });
    registerMock('CustomersSummary', () => ({
        counterpartySummary: {
            totalCount: CUSTOMERS.length,
            activeCount: CUSTOMERS.filter(c => c.isActive).length,
            totalCreditBalance: 1000000,
            highUsageCount: 1,
        },
    }));
    registerMock('Branches', () => ({
        branches: [
            { erpId: 'branch-a', name: 'branch-a' },
            { erpId: 'branch-b', name: 'branch-b' },
        ],
    }));
    registerMock('TeamMembers', () => ({
        teamMembers: [
            { id: '1', firstName: 'Alex', lastName: 'Manager', roleCodes: ['manager'] },
            { id: '2', firstName: 'Nina', lastName: 'Director', roleCodes: ['general-director'] },
        ],
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
            mockCustomersData();
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
            registerMock('CustomersPage', () => ({ counterparties: { items: [], totalItems: 0 } }));
            registerMock('CustomersSummary', () => ({
                counterpartySummary: {
                    totalCount: 0,
                    activeCount: 0,
                    totalCreditBalance: 0,
                    highUsageCount: 0,
                },
            }));
            registerMock('Branches', () => ({ branches: [] }));
            registerMock('TeamMembers', () => ({ teamMembers: [] }));
            registerMock('ExpiringDiscountGrants', () => ({ expiringDiscountGrants: [] }));
            registerMock('ActiveDiscountCountForCounterparty', () => ({
                discountGrantsForCounterparty: [],
            }));
            registerMock('LastOrderDates', () => ({ visibleOrders: { items: [] } }));
            await router.push('/customers');
        },
    ],
    render: () => ({
        components: { CustomersPage },
        template: '<CustomersPage />',
    }),
};
