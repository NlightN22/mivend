import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { paginate, includesCi } from '../../../.storybook/mock-list-utils';

const CUSTOMERS = [
    { key: 'c1', first: 'Ivan', last: 'Petrov', company: 'customer-101' },
    { key: 'c2', first: 'Olga', last: 'Sidorova', company: 'customer-102' },
    { key: 'c3', first: 'Sergey', last: 'Kuznetsov', company: 'customer-103' },
    { key: 'c4', first: 'Marina', last: 'Volkova', company: 'customer-104' },
];
const STATES = [
    'PaymentAuthorized',
    'PaymentSettled',
    'Shipped',
    'Delivered',
    'Cancelled',
    'ArrangingPayment',
];
const RESERVATIONS = ['RESERVED', 'RELEASED', 'FAILED', 'AWAITING_CONFIRMATION'];

export const MOCK_ORDERS = Array.from({ length: 24 }, (_, i) => {
    const customer = CUSTOMERS[i % CUSTOMERS.length];
    const createdAt = new Date(Date.now() - i * 86400000).toISOString();
    return {
        id: String(i + 1),
        code: String(1000 + i),
        state: STATES[i % STATES.length],
        totalWithTax: 45000 + i * 12345,
        currencyCode: 'RUB',
        orderPlacedAt: createdAt,
        createdAt,
        creditLimitExceeded: i % 7 === 0,
        customerKey: customer.key,
        customFields: {
            reservationState: RESERVATIONS[i % RESERVATIONS.length],
            reservationFailureReason: i % 6 === 2 ? 'INSUFFICIENT_STOCK' : null,
            erpStatus: null,
            hasCheckFindings: i % 5 === 0,
            placedByAdministratorId: i % 3 === 0 ? null : String((i % 2) + 1),
        },
        customer: {
            firstName: customer.first,
            lastName: customer.last,
        },
        counterparty: {
            shortName: customer.company,
            inn: '7701234567',
            priceType: 'price-type-wholesale',
            assignedManagerId: '1',
            branchId: i % 2 ? 'branch-a' : 'branch-b',
        },
    };
});

interface OrdersVariables {
    options?: {
        skip?: number;
        take?: number;
        filter?: { state?: { eq?: string; in?: string[] } };
    };
    customerId?: string;
    search?: string;
}

export function mockOrdersList(orders = MOCK_ORDERS): void {
    registerMock('OrdersPage', (variables: OrdersVariables) => {
        let filtered = orders;
        if (variables.customerId)
            filtered = filtered.filter(o => o.customerKey === variables.customerId);
        const state = variables.options?.filter?.state;
        if (state?.eq) filtered = filtered.filter(o => o.state === state.eq);
        if (state?.in) filtered = filtered.filter(o => state.in?.includes(o.state));
        if (variables.search) {
            const term = variables.search;
            filtered = filtered.filter(
                o =>
                    includesCi(o.code, term) || includesCi(o.customer.counterparty.shortName, term),
            );
        }
        return { visibleOrders: paginate(filtered, variables.options) };
    });
    registerMock('TeamMembers', () => ({
        teamMembers: [
            {
                id: '1',
                firstName: 'Alex',
                lastName: 'Manager',
                emailAddress: '',
                roleCodes: ['manager'],
            },
            { id: '2', firstName: 'Nina', lastName: 'Director', emailAddress: '', roleCodes: [] },
        ],
    }));
    registerMock('Branches', () => ({
        branches: [
            { id: 'branch-a', erpId: 'branch-a', name: 'branch-a' },
            { id: 'branch-b', erpId: 'branch-b', name: 'branch-b' },
        ],
    }));
    registerMock('OrderStatuses', () => ({ orderStatuses: [] }));
}
