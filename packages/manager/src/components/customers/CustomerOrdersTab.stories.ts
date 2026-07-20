import type { Meta, StoryObj } from '@storybook/vue3';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { paginate } from '../../../.storybook/mock-list-utils';
import CustomerOrdersTab from './CustomerOrdersTab.vue';
import type { CustomerOrderItem } from '../../api/customers';

const STATES = [
    'ArrangingPayment',
    'PaymentAuthorized',
    'PaymentSettled',
    'Shipped',
    'Delivered',
    'Cancelled',
];
const FULFILLMENT_STATES = ['Pending', 'Shipped', 'Delivered'];
const RESERVATION_STATES = ['AWAITING_CONFIRMATION', 'RESERVED', 'EXPIRED', 'RELEASED', 'FAILED'];
const ADMINS = [
    { id: 'admin-1', firstName: 'Petr', lastName: 'Manager' },
    { id: 'admin-2', firstName: 'Elena', lastName: 'Sales' },
];

// 34 orders — enough to exercise real pagination (PAGE_SIZE=20 in CustomerOrdersTab.vue), unlike
// the previous single-page mock that made "no pagination controls ever show up" invisible.
// Every 3rd order has no administrator on its first history entry — placed by the storefront
// customer directly, not an operator/manager (see placedByLabel() in CustomerOrdersTab.vue).
const ORDERS: CustomerOrderItem[] = Array.from({ length: 34 }, (_, i) => ({
    id: String(100 + i),
    code: `ORD-202607-${(1000 + i).toString(16).toUpperCase()}`,
    state: STATES[i % STATES.length],
    totalWithTax: 45000 + i * 12345,
    currencyCode: 'USD',
    orderPlacedAt: new Date(Date.now() - i * 86400000).toISOString(),
    createdAt: new Date(Date.now() - i * 86400000).toISOString(),
    totalQuantity: 3 + (i % 12),
    customer: { firstName: 'Ivan', lastName: 'Petrov' },
    customFields: {
        latestFulfillmentState:
            i % 4 === 0 ? null : FULFILLMENT_STATES[i % FULFILLMENT_STATES.length],
        placedByAdministratorId: i % 3 === 0 ? null : ADMINS[i % ADMINS.length].id,
        reservationState: i % 5 === 0 ? null : RESERVATION_STATES[i % RESERVATION_STATES.length],
    },
}));

// Cycles Unpaid / Partially paid / Paid by index, so the Payment badge's three states and the
// view chips' real server-side filtering are all exercised in the same story.
type PaymentBucket = 'unpaid' | 'partial' | 'paid';
function paymentBucket(index: number): PaymentBucket {
    const cycle = index % 3;
    return cycle === 0 ? 'unpaid' : cycle === 1 ? 'partial' : 'paid';
}
function capturedAmountFor(order: CustomerOrderItem, index: number): number {
    const bucket = paymentBucket(index);
    if (bucket === 'unpaid') return 0;
    if (bucket === 'partial') return Math.round(order.totalWithTax / 2);
    return order.totalWithTax;
}

interface PageVariables {
    options?: { skip?: number; take?: number; filter?: { state?: { eq?: string } } };
}
interface PaymentViewVariables extends PageVariables {
    paymentView: PaymentBucket;
}

function mockCustomerOrders(orders: CustomerOrderItem[]): void {
    // Feeds placedByLabel()'s manager-name lookup (CustomerOrdersTab.vue) — resolves
    // customFields.placedByAdministratorId to a display name, same query fetchManagerOptions
    // uses on the main Orders page.
    registerMock('TeamMembers', () => ({
        teamMembers: ADMINS.map(a => ({
            id: a.id,
            firstName: a.firstName,
            lastName: a.lastName,
            roleCodes: ['manager'],
        })),
    }));
    // Mirrors fetchOrdersPageForCustomer's two real backend queries — visibleOrders (All/
    // Cancelled, via a plain state filter) and customerOrdersByPaymentView (Unpaid/Partially
    // paid, via plugin-acquiring's real subquery) — see api/customers.ts's comment for why
    // these are two separate GraphQL fields.
    registerMock('CustomerOrdersPage', (variables: PageVariables) => {
        const filtered =
            variables.options?.filter?.state?.eq === 'Cancelled'
                ? orders.filter(o => o.state === 'Cancelled')
                : orders;
        return { visibleOrders: paginate(filtered, variables.options) };
    });
    registerMock('CustomerOrdersByPaymentView', (rawVariables: Record<string, unknown>) => {
        const variables = rawVariables as unknown as PaymentViewVariables;
        const filtered = orders.filter((_, i) => paymentBucket(i) === variables.paymentView);
        return { customerOrdersByPaymentView: paginate(filtered, variables.options) };
    });
    registerMock('CustomerOrderViewCounts', () => ({
        all: { totalItems: orders.length },
        cancelled: { totalItems: orders.filter(o => o.state === 'Cancelled').length },
        unpaid: { totalItems: orders.filter((_, i) => paymentBucket(i) === 'unpaid').length },
        partial: { totalItems: orders.filter((_, i) => paymentBucket(i) === 'partial').length },
    }));
    registerMock('OrderPaymentSummaries', () => ({
        orderPaymentSummaries: orders.map((order, i) => ({
            orderId: order.id,
            capturedAmount: capturedAmountFor(order, i),
        })),
    }));
}

const meta: Meta<typeof CustomerOrdersTab> = {
    title: 'Components/Customers/CustomerOrdersTab',
    component: CustomerOrdersTab,
    tags: ['autodocs'],
    args: { customerId: '1' },
};

export default meta;
type Story = StoryObj<typeof CustomerOrdersTab>;

export const Default: Story = {
    loaders: [async () => mockCustomerOrders(ORDERS)],
};

export const Empty: Story = {
    loaders: [async () => mockCustomerOrders([])],
};

// See AGENTS.md's "Manager portal rules" tab-overflow pattern discussion — this tab is the
// current baseline being redesigned against tasks/design/b2b_portal/
// mivend_customer_orders_concept_v5.html; keep a mobile bookmark to compare against the
// concept's mobile card layout as the redesign lands.
export const Mobile: Story = {
    loaders: [async () => mockCustomerOrders(ORDERS)],
    parameters: { viewport: { defaultViewport: 'mvMobile' } },
};
