import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { paginate } from '../../../.storybook/mock-list-utils';
import CustomerDetailPage from './CustomerDetailPage.vue';
import type { CustomerOrderItem } from '../../api/customers';
import type { ProformaInvoiceListItem } from '../../api/proforma-invoices';

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

// Feeds the Overview KPI strip (the latest 20 orders).
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
    // Every 3rd order has no placedByAdministratorId: placed by the storefront customer directly.
    customFields: {
        latestFulfillmentState:
            i % 4 === 0 ? null : FULFILLMENT_STATES[i % FULFILLMENT_STATES.length],
        placedByAdministratorId: i % 3 === 0 ? null : '1',
        reservationState: i % 5 === 0 ? null : RESERVATION_STATES[i % RESERVATION_STATES.length],
    },
}));

const PROFORMA_INVOICE_STATUSES = ['current', 'superseded', 'cancelled'];
// 6 proforma invoices cycling through the 3 display statuses — enough to exercise every chip/badge variant.
const CUSTOMER_PROFORMA_INVOICES: ProformaInvoiceListItem[] = Array.from({ length: 6 }, (_, i) => ({
    id: `INV-${1000 + i}`,
    number: `ORD-${200 + i}-01-1`,
    version: 1,
    supersededBy: null,
    createdAt: new Date(2026, 6, 1 + i).toISOString(),
    orderId: String(200 + i),
    counterpartyId: '1',
    counterpartyShortName: null,
    amount: 45000 + i * 8760,
    currencyCode: 'RUB',
    displayStatus: PROFORMA_INVOICE_STATUSES[i % PROFORMA_INVOICE_STATUSES.length],
    issuedAt: new Date(2026, 6, 1 + i).toISOString(),
    dueDate: new Date(2026, 6, 4 + i).toISOString(),
    branchId: 'branch-a',
    order: { code: `ORD-${200 + i}` },
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
                    defects: [],
                    customerUsable: true,
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
    registerMock('CustomerDocumentsPage', () => ({ documents: { totalItems: 0, items: [] } }));
    // Feeds the nested ProformaInvoicesList of the "ProformaInvoices" tab, filtered by status server-side per view chip.
    registerMock('ProformaInvoicesPage', (rawVariables: Record<string, unknown>) => {
        const variables = rawVariables as unknown as {
            options?: { skip?: number; take?: number; status?: string };
        };
        const status = variables.options?.status;
        const filtered = status
            ? CUSTOMER_PROFORMA_INVOICES.filter(inv => inv.displayStatus === status)
            : CUSTOMER_PROFORMA_INVOICES;
        return { visibleProformaInvoices: paginate(filtered, variables.options) };
    });
    registerMock('ProformaInvoiceViewCounts', () => ({
        all: { totalItems: CUSTOMER_PROFORMA_INVOICES.length },
        current: {
            totalItems: CUSTOMER_PROFORMA_INVOICES.filter(i => i.displayStatus === 'current')
                .length,
        },
        superseded: {
            totalItems: CUSTOMER_PROFORMA_INVOICES.filter(i => i.displayStatus === 'superseded')
                .length,
        },
        cancelled: {
            totalItems: CUSTOMER_PROFORMA_INVOICES.filter(i => i.displayStatus === 'cancelled')
                .length,
        },
    }));
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

export const ProformaInvoicesTab: Story = {
    ...Default,
    loaders: [
        async () => {
            mockCustomerDetailData();
            await router.push('/customers/1?tab=proformaInvoices');
        },
    ],
};

// Pinned to mobile viewport so the "3 tabs + More" overflow shows without the viewport dropdown
// Follows the tab-overflow pattern in the manager-portal-rules skill
export const Mobile: Story = {
    ...Default,
    parameters: { viewport: { defaultViewport: 'mvMobile' } },
};
