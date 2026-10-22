import { describe, expect, it } from 'vitest';

import { DEFAULT_ROLES } from '../../default-roles';

// A role with these permissions bypasses the counterparty scope of Admin customers/customer(id).
const CUSTOMER_BYPASS = [
    'CreateCustomer',
    'UpdateCustomer',
    'DeleteCustomer',
    'ReadCustomerGroup',
    'UpdateCustomerGroup',
];

describe('default roles and the customer scope', () => {
    it.each(DEFAULT_ROLES.map(r => [r.code, r.permissions] as const))(
        '%s holds no unscoped customer permission',
        (_code, permissions) => {
            expect(permissions.filter(p => CUSTOMER_BYPASS.includes(p))).toEqual([]);
        },
    );
});
