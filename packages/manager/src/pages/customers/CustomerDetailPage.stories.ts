import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { paginate } from '../../../.storybook/mock-list-utils';
import CustomerDetailPage from './CustomerDetailPage.vue';
import type { CustomerOrderItem } from '../../api/customers';
import type { InvoiceListItem } from '../../api/invoices';
import type { PaymentListItem } from '../../api/payments';

type PaymentBucket = 'unpaid' | 'partial' | 'paid';
function paymentBucket(index: number): PaymentBucket {
    const cycle = index % 3;
    return cycle === 0 ? 'unpaid' : cycle === 1 ? 'partial' : 'paid';
}
interface PageVariables {
    options?: { skip?: number; take?: number; filter?: { state?: { eq?: string } } };
}
interface PaymentViewVariables extends PageVariables {
    paymentView: PaymentBucket;
}

const ORDER_STATES = [
    'ArrangingPayment',
    'PaymentAuthorized',
    'PaymentSettled',
    'Shipped',
    'Delivered',
    'Cancelled',
];
const FULFILLMENT_STATES = ['Pending', 'Shipped', 'Delivered'];
const RESERVATION_STATES = ['AWAITING_CONFIRMATION', 'RESERVED', 'EXPIRED', 'RELEASED', 'FAILED'];

// 27 orders with varied statuses/dates — enough to show a real paginated table (PAGE_SIZE=20 in
// CustomerOrdersTab.vue) instead of a single flat row, matching what a real active customer
// (e.g. "E2E Co" on the live site, 111 orders) actually looks like.
const CUSTOMER_ORDERS: CustomerOrderItem[] = Array.from({ length: 27 }, (_, i) => ({
    id: String(200 + i),
    code: `ORD-202607-${(2000 + i).toString(16).toUpperCase()}`,
    state: ORDER_STATES[i % ORDER_STATES.length],
    totalWithTax: 45000 + i * 8760,
    currencyCode: 'RUB',
    orderPlacedAt: new Date(Date.now() - i * 86400000).toISOString(),
    createdAt: new Date(Date.now() - i * 86400000).toISOString(),
    totalQuantity: 2 + (i % 10),
    customer: { firstName: 'Ivan', lastName: 'Petrov' },
    // Every 3rd order has no placedByAdministratorId — placed by the storefront customer
    // directly (see placedByLabel() in CustomerOrdersTab.vue).
    customFields: {
        latestFulfillmentState:
            i % 4 === 0 ? null : FULFILLMENT_STATES[i % FULFILLMENT_STATES.length],
        placedByAdministratorId: i % 3 === 0 ? null : '1',
        reservationState: i % 5 === 0 ? null : RESERVATION_STATES[i % RESERVATION_STATES.length],
    },
}));

const INVOICE_STATUSES = ['pending', 'issued', 'paid', 'cancelled'];
// 6 invoices cycling through all 4 statuses — enough to exercise every chip/badge variant.
const CUSTOMER_INVOICES: InvoiceListItem[] = Array.from({ length: 6 }, (_, i) => ({
    id: `INV-${1000 + i}`,
    orderId: String(200 + i),
    counterpartyId: '1',
    amount: 45000 + i * 8760,
    currencyCode: 'RUB',
    status: INVOICE_STATUSES[i % INVOICE_STATUSES.length],
    branchId: 'branch-a',
    order: { code: `ORD-${200 + i}` },
}));

const PAYMENT_STATUSES = ['pending', 'authorized', 'captured', 'failed', 'canceled'];
// 5 payments cycling through a handful of statuses — enough to exercise several badge variants.
const CUSTOMER_PAYMENTS: PaymentListItem[] = Array.from({ length: 5 }, (_, i) => ({
    id: `PAY-${1000 + i}`,
    channel: i % 2 === 0 ? 'online-acquiring' : 'branch-kassa',
    paymentStatus: PAYMENT_STATUSES[i % PAYMENT_STATUSES.length],
    amount: 45000 + i * 8760,
    currencyCode: 'RUB',
    invoiceId: `INV-${1000 + i}`,
    counterpartyId: '1',
}));

const meta: Meta<typeof CustomerDetailPage> = {
    title: 'Pages/Customers/CustomerDetailPage',
    component: CustomerDetailPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof CustomerDetailPage>;

function mockCustomerDetailData(): void {
    registerMock('CustomerById', () => ({
        counterparty: {
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
    }));
    registerMock('TeamMembers', () => ({
        teamMembers: [{ id: '1', firstName: 'Alex', lastName: 'Manager', roleCodes: ['manager'] }],
    }));
    registerMock('Branches', () => ({ branches: [{ erpId: 'branch-a', name: 'branch-a' }] }));
    registerMock('CustomerOrders', () => ({
        visibleOrders: { items: CUSTOMER_ORDERS.slice(0, 20) },
    }));
    // Feeds CustomerOrdersTab (the "Orders" tab), which paginates each view chip independently
    // from the Overview KPI fetch above (CustomerOrders) — see fetchOrdersPageForCustomer's
    // comment in api/customers.ts for why these are separate queries.
    registerMock('CustomerOrdersPage', (variables: PageVariables) => {
        const filtered =
            variables.options?.filter?.state?.eq === 'Cancelled'
                ? CUSTOMER_ORDERS.filter(o => o.state === 'Cancelled')
                : CUSTOMER_ORDERS;
        return { visibleOrders: paginate(filtered, variables.options) };
    });
    registerMock('CustomerOrdersByPaymentView', (rawVariables: Record<string, unknown>) => {
        const variables = rawVariables as unknown as PaymentViewVariables;
        const filtered = CUSTOMER_ORDERS.filter(
            (_, i) => paymentBucket(i) === variables.paymentView,
        );
        return { customerOrdersByPaymentView: paginate(filtered, variables.options) };
    });
    registerMock('CustomerOrderViewCounts', () => ({
        all: { totalItems: CUSTOMER_ORDERS.length },
        cancelled: { totalItems: CUSTOMER_ORDERS.filter(o => o.state === 'Cancelled').length },
        unpaid: {
            totalItems: CUSTOMER_ORDERS.filter((_, i) => paymentBucket(i) === 'unpaid').length,
        },
        partial: {
            totalItems: CUSTOMER_ORDERS.filter((_, i) => paymentBucket(i) === 'partial').length,
        },
    }));
    // Cycles Unpaid (0) / Partially paid (half) / Paid (full) across the mocked orders so all
    // three Payment badge states are visible — see CustomerOrdersTab.stories.ts's
    // capturedAmountFor for the same pattern.
    registerMock('OrderPaymentSummaries', () => ({
        orderPaymentSummaries: CUSTOMER_ORDERS.map((order, i) => ({
            orderId: order.id,
            capturedAmount:
                i % 3 === 0
                    ? 0
                    : i % 3 === 1
                      ? Math.round(order.totalWithTax / 2)
                      : order.totalWithTax,
        })),
    }));
    registerMock('CustomerDiscountGrants', () => ({ discountGrantsForCounterparty: [] }));
    registerMock('CustomerDocumentsPage', () => ({ documents: { totalItems: 0, items: [] } }));
    // Feeds CustomerInvoicesTab (the "Invoices" tab) — same shape as the standalone
    // InvoicesPage.vue, filtered by status server-side per view chip.
    registerMock('InvoicesPage', (rawVariables: Record<string, unknown>) => {
        const variables = rawVariables as unknown as {
            options?: { skip?: number; take?: number; status?: string };
        };
        const status = variables.options?.status;
        const filtered = status
            ? CUSTOMER_INVOICES.filter(inv => inv.status === status)
            : CUSTOMER_INVOICES;
        return { visibleInvoices: paginate(filtered, variables.options) };
    });
    registerMock('InvoiceViewCounts', () => ({
        all: { totalItems: CUSTOMER_INVOICES.length },
        pending: { totalItems: CUSTOMER_INVOICES.filter(i => i.status === 'pending').length },
        issued: { totalItems: CUSTOMER_INVOICES.filter(i => i.status === 'issued').length },
        paid: { totalItems: CUSTOMER_INVOICES.filter(i => i.status === 'paid').length },
        cancelled: { totalItems: CUSTOMER_INVOICES.filter(i => i.status === 'cancelled').length },
    }));
    // Feeds CustomerPaymentsTab (the "Payments" tab) — same shape as the standalone
    // PaymentsPage.vue, filtered by status/channel server-side via PaymentsFilterBar.
    registerMock('PaymentsPage', (rawVariables: Record<string, unknown>) => {
        const variables = rawVariables as unknown as {
            options?: { skip?: number; take?: number; status?: string; channel?: string };
        };
        const status = variables.options?.status;
        const channel = variables.options?.channel;
        const filtered = CUSTOMER_PAYMENTS.filter(
            p => (!status || p.paymentStatus === status) && (!channel || p.channel === channel),
        );
        return { visiblePayments: paginate(filtered, variables.options) };
    });
    registerMock('CustomerIdForCounterparty', () => ({
        customers: { items: [{ id: '1' }] },
    }));
}

export const Default: Story = {
    loaders: [
        async () => {
            mockCustomerDetailData();
            await router.push('/customers/1');
        },
    ],
    render: () => ({
        components: { CustomerDetailPage },
        template: '<CustomerDetailPage />',
    }),
};

// A dedicated sidebar entry pinned to the mobile viewport (see AGENTS.md's "Manager portal
// rules" tab-overflow pattern) — click straight into this story to see the mobile "3 tabs +
// More" layout without going through the viewport dropdown first.
export const Mobile: Story = {
    ...Default,
    parameters: { viewport: { defaultViewport: 'mvMobile' } },
};
