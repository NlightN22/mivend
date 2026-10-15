import { registerMock } from './graphql-mock-registry';

// Global default so pages behind the auth-gated layout render in every story without setup.
// Stories can override it by calling registerMock again with the same key, e.g. for logged-out state.
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
                fullName: 'Customer LLC',
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
    registerMock('MyProformaInvoices', () => ({
        myProformaInvoices: { items: [], totalItems: 0 },
    }));
    registerMock('MyPayments', () => ({ myPayments: { items: [], totalItems: 0 } }));
}
