import type { Meta, StoryObj } from '@storybook/vue3';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { router } from '../../router';
import OrderQuickPanel from './OrderQuickPanel.vue';
import type { OrderListRow } from './ordersListRows';

const ROW: OrderListRow = {
    id: '7',
    code: '1000000007',
    createdAt: '2026-11-01T10:00:00Z',
    customer: 'customer-101',
    customerMeta: 'INN 7701234567 · price-type-wholesale',
    manager: 'Alex Manager',
    branch: 'branch-a',
    state: 'Arranging payment',
    stateVariant: 'warning',
    flags: [{ label: 'ERP requirements', variant: 'warning' }],
    total: 'RUB 45,000.00',
    currencyCode: 'RUB',
    placedBy: 'Ivan Petrov',
    placedByMeta: 'customer',
    reservation: 'Awaiting confirmation',
    reservationVariant: 'warning',
    attention: '',
};

const meta: Meta<typeof OrderQuickPanel> = {
    title: 'Components/Orders/OrderQuickPanel',
    component: OrderQuickPanel,
    tags: ['autodocs'],
    args: { row: ROW },
};

export default meta;
type Story = StoryObj<typeof OrderQuickPanel>;

// The route guard loads the administrator, so the story enters a guarded route first.
async function grant(reservationState: string, findings: unknown[] = []): Promise<void> {
    registerMock('ActiveAdministrator', () => ({
        activeAdministrator: {
            id: '1',
            firstName: 'Alex',
            lastName: 'Manager',
            emailAddress: 'manager@example.com',
            customFields: { departmentId: 'dept-sales', branchId: 'branch-a' },
            user: {
                roles: [
                    {
                        code: 'manager',
                        description: 'Manager',
                        permissions: ['ConfirmOrder', 'CancelOrder', 'ReadCheckResults'],
                    },
                ],
            },
        },
    }));
    registerMock('OrderDecisionFacts', () => ({
        visibleOrders: {
            items: [
                {
                    id: '7',
                    state: 'ArrangingPayment',
                    cancellable: true,
                    customFields: { reservationState, reservationDays: 5 },
                },
            ],
        },
    }));
    registerMock('OrderCheckResults', () => ({ checkResults: findings }));
    await router.push('/orders');
}

export const ConfirmAvailable: Story = { loaders: [async () => grant('AWAITING_CONFIRMATION')] };

export const ConfirmWithOpenFindings: Story = {
    loaders: [
        async () =>
            grant('AWAITING_CONFIRMATION', [
                {
                    id: 'f1',
                    checkCode: 'contract',
                    stage: null,
                    lineRef: null,
                    severity: 'error',
                    messageKey: 'order.contract-unresolved.missing',
                    facts: {},
                    computedAt: '2026-11-01T10:00:00Z',
                    stale: false,
                },
            ]),
    ],
};

export const AlreadyConfirmed: Story = { loaders: [async () => grant('RESERVED')] };

export const RejectDialog: Story = {
    loaders: [async () => grant('AWAITING_CONFIRMATION')],
    play: async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
        document.querySelector<HTMLElement>('[data-testid="order-reject"]')?.click();
    },
};
