import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import DashboardPage from './DashboardPage.vue';

const meta: Meta<typeof DashboardPage> = {
    title: 'Pages/Dashboard/DashboardPage',
    component: DashboardPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof DashboardPage>;

function mockDashboardData(): void {
    registerMock('ManagerDashboard', () => ({
        activeOrders: { totalItems: 12 },
        activeOrdersLast24h: { totalItems: 3 },
        awaitingShipment: { totalItems: 5 },
        overdue: { totalItems: 1 },
        recentOrdersList: {
            items: [
                {
                    code: 'ORD-101',
                    state: 'PaymentAuthorized',
                    orderPlacedAt: new Date().toISOString(),
                    totalWithTax: 450000,
                    currencyCode: 'RUB',
                    customer: { firstName: 'Ivan', lastName: 'Petrov' },
                },
                {
                    code: 'ORD-102',
                    state: 'PaymentSettled',
                    orderPlacedAt: new Date(Date.now() - 86400000 * 4).toISOString(),
                    totalWithTax: 129000,
                    currencyCode: 'RUB',
                    customer: { firstName: 'Olga', lastName: 'Sidorova' },
                },
            ],
        },
        counterpartySummary: { totalCount: 34 },
        unassignedCounterpartyCount: 2,
        myApprovalRequestsSummary: {
            pendingCount: 3,
            recent: [
                {
                    id: '1',
                    requestType: 'discount-grant',
                    status: 'pending',
                    currentStepRole: 'general-director',
                    createdAt: new Date().toISOString(),
                    decidedAt: null,
                },
            ],
        },
        myApprovalsInbox: { awaitingMyDecision: { totalItems: 2 } },
    }));
}

export const Default: Story = {
    loaders: [
        async () => {
            mockDashboardData();
            await router.push('/');
        },
    ],
    render: () => ({
        components: { DashboardPage },
        template: '<DashboardPage />',
    }),
};

export const Empty: Story = {
    loaders: [
        async () => {
            registerMock('ManagerDashboard', () => ({
                activeOrders: { totalItems: 0 },
                activeOrdersLast24h: { totalItems: 0 },
                awaitingShipment: { totalItems: 0 },
                overdue: { totalItems: 0 },
                recentOrdersList: { items: [] },
                counterpartySummary: { totalCount: 0 },
                unassignedCounterpartyCount: 0,
                myApprovalRequestsSummary: { pendingCount: 0, recent: [] },
                myApprovalsInbox: { awaitingMyDecision: { totalItems: 0 } },
            }));
            await router.push('/');
        },
    ],
    render: () => ({
        components: { DashboardPage },
        template: '<DashboardPage />',
    }),
};
