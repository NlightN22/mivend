import { registerMock } from './graphql-mock-registry';

// Registered on every story so pages behind the auth guard render without extra setup —
// individual stories can call registerMock('ActiveAdministrator', ...) again to override.
export function registerDefaultMocks(): void {
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
                        code: 'general-director',
                        description: 'General director — full company-wide visibility',
                        permissions: ['ReadCustomer', 'ReadOrder', 'ReadCatalog'],
                    },
                ],
            },
        },
    }));

    // Background call on most authenticated pages (dashboard, discounts) — empty by default so
    // an unrelated page's story doesn't need to know about it; override per-story if needed.
    registerMock('ExpiringDiscountGrants', () => ({ expiringDiscountGrants: [] }));
}
