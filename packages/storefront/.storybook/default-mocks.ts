import { registerMock } from './graphql-mock-registry';

// Registered on every story so pages behind the auth-gated layout render without extra setup —
// individual stories can call registerMock('ActiveCustomerForAuth', ...) again to override
// (e.g. to render a logged-out state).
export function registerDefaultMocks(): void {
    registerMock('ActiveCustomerForAuth', () => ({
        activeCustomer: {
            id: '1',
            firstName: 'Ivan',
            lastName: 'Petrov',
            emailAddress: 'customer@example.com',
            customFields: { portalRole: 'buyer', preferredTradingPointId: 'point-1' },
            counterparty: {
                id: '1',
                erpId: 'cnt-001',
                legalName: 'Customer LLC',
                shortName: 'Customer',
                inn: '7700000000',
                creditLimit: 500000,
                creditBalance: 120000,
                paymentDelayDays: 14,
                priceType: 'price-type-wholesale',
            },
            preferredTradingPoint: {
                id: 'point-1',
                name: 'Trading point A',
                address: 'branch-a address',
                workingHours: '09:00-18:00',
                deliveryComment: null,
            },
        },
    }));
    registerMock('MyInvoices', () => ({ myInvoices: { items: [], totalItems: 0 } }));
    registerMock('MyPayments', () => ({ myPayments: { items: [], totalItems: 0 } }));
}
