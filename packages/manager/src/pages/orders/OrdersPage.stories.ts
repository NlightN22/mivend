import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { paginate, includesCi } from '../../../.storybook/mock-list-utils';
import OrdersPage from './OrdersPage.vue';

const meta: Meta<typeof OrdersPage> = {
    title: 'Pages/Orders/OrdersPage',
    component: OrdersPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof OrdersPage>;

interface MockOrderCustomer {
    firstName: string;
    lastName: string;
    counterparty: {
        shortName: string;
        inn: string;
        priceType: string;
        assignedManagerId: string;
        branchId: string;
    };
}

function customer(
    firstName: string,
    lastName: string,
    shortName: string,
    branchId: string,
): MockOrderCustomer {
    return {
        firstName,
        lastName,
        counterparty: {
            shortName,
            inn: '7701234567',
            priceType: 'price-type-wholesale',
            assignedManagerId: '1',
            branchId,
        },
    };
}

const ORDERS = [
    {
        id: '1',
        code: 'ORD-101',
        state: 'PaymentAuthorized',
        totalWithTax: 450000,
        currencyCode: 'RUB',
        orderPlacedAt: new Date().toISOString(),
        customFields: { reservationState: 'RESERVED' },
        customer: customer('Ivan', 'Petrov', 'customer-101', 'branch-a'),
    },
    {
        id: '2',
        code: 'ORD-102',
        state: 'PaymentSettled',
        totalWithTax: 129000,
        currencyCode: 'RUB',
        orderPlacedAt: new Date(Date.now() - 86400000).toISOString(),
        customFields: { reservationState: 'RESERVED' },
        customer: customer('Olga', 'Sidorova', 'customer-102', 'branch-a'),
    },
    {
        id: '3',
        code: 'ORD-103',
        state: 'Shipped',
        totalWithTax: 78000,
        currencyCode: 'RUB',
        orderPlacedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
        customFields: { reservationState: 'RELEASED' },
        customer: customer('Ivan', 'Petrov', 'customer-101', 'branch-a'),
    },
    {
        id: '4',
        code: 'ORD-104',
        state: 'Delivered',
        totalWithTax: 315000,
        currencyCode: 'RUB',
        orderPlacedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
        customFields: { reservationState: 'RELEASED' },
        customer: customer('Sergey', 'Kuznetsov', 'customer-103', 'branch-b'),
    },
    {
        id: '5',
        code: 'ORD-105',
        state: 'Cancelled',
        totalWithTax: 54000,
        currencyCode: 'RUB',
        orderPlacedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
        customFields: { reservationState: 'RELEASED' },
        customer: customer('Olga', 'Sidorova', 'customer-102', 'branch-b'),
    },
    {
        id: '6',
        code: 'ORD-106',
        state: 'PaymentAuthorized',
        totalWithTax: 220000,
        currencyCode: 'RUB',
        orderPlacedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
        customFields: { reservationState: 'FAILED' },
        customer: customer('Sergey', 'Kuznetsov', 'customer-103', 'branch-a'),
    },
    {
        id: '7',
        code: 'ORD-107',
        state: 'ArrangingPayment',
        totalWithTax: 96000,
        currencyCode: 'RUB',
        orderPlacedAt: new Date(Date.now() - 6 * 86400000).toISOString(),
        customFields: { reservationState: 'RESERVED' },
        customer: customer('Marina', 'Volkova', 'customer-104', 'branch-b'),
    },
    {
        id: '8',
        code: 'ORD-108',
        state: 'PaymentSettled',
        totalWithTax: 187000,
        currencyCode: 'RUB',
        orderPlacedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
        customFields: { reservationState: 'RELEASED' },
        customer: customer('Marina', 'Volkova', 'customer-104', 'branch-a'),
    },
];

interface OrdersPageVariables {
    options?: {
        skip?: number;
        take?: number;
        filter?: {
            state?: { eq?: string };
            customFields?: { reservationState?: { eq?: string } };
        };
    };
    managerId?: string;
    search?: string;
}

function mockOrdersData(): void {
    registerMock('OrdersPage', (variables: OrdersPageVariables) => {
        let filtered = ORDERS;
        const stateFilter = variables.options?.filter?.state?.eq;
        if (stateFilter) filtered = filtered.filter(o => o.state === stateFilter);
        const reservationFilter = variables.options?.filter?.customFields?.reservationState?.eq;
        if (reservationFilter) {
            filtered = filtered.filter(o => o.customFields.reservationState === reservationFilter);
        }
        if (variables.search) {
            const term = variables.search;
            filtered = filtered.filter(
                o =>
                    includesCi(o.code, term) ||
                    includesCi(o.customer.firstName, term) ||
                    includesCi(o.customer.lastName, term),
            );
        }
        return { visibleOrders: paginate(filtered, variables.options) };
    });
    registerMock('OrdersSummary', () => ({
        open: { totalItems: ORDERS.length },
        overdue: { totalItems: 1 },
        today: {
            totalItems: 2,
            items: ORDERS.slice(0, 2).map(o => ({ totalWithTax: o.totalWithTax })),
        },
        processing: { totalItems: 2 },
        drafts: { totalItems: 0 },
        allOpen: { items: ORDERS },
        pendingPriceAdjustmentOrderIds: [],
    }));
    registerMock('TeamMembers', () => ({
        teamMembers: [
            { id: '1', firstName: 'Alex', lastName: 'Manager', roleCodes: ['manager'] },
            { id: '2', firstName: 'Nina', lastName: 'Director', roleCodes: ['general-director'] },
        ],
    }));
    registerMock('Branches', () => ({
        branches: [
            { erpId: 'branch-a', name: 'branch-a' },
            { erpId: 'branch-b', name: 'branch-b' },
        ],
    }));
}

export const Default: Story = {
    loaders: [
        async () => {
            mockOrdersData();
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
            registerMock('OrdersPage', () => ({ visibleOrders: { items: [], totalItems: 0 } }));
            registerMock('OrdersSummary', () => ({
                open: { totalItems: 0 },
                overdue: { totalItems: 0 },
                today: { totalItems: 0, items: [] },
                processing: { totalItems: 0 },
                drafts: { totalItems: 0 },
                allOpen: { items: [] },
                pendingPriceAdjustmentOrderIds: [],
            }));
            registerMock('TeamMembers', () => ({ teamMembers: [] }));
            registerMock('Branches', () => ({ branches: [] }));
            await router.push('/orders');
        },
    ],
    render: () => ({
        components: { OrdersPage },
        template: '<OrdersPage />',
    }),
};
