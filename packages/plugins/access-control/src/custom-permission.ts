import { PermissionDefinition } from '@vendure/core';

// A Permission name encodes an action only, never a scope — see docs/access-control.md, layer 2.
// Row-level visibility ("own"/"department"/"all") is resolved by AccessScopeService, not by a
// permission triplet like ReadOwnX/ReadDepartmentX/ReadAllX.
export const CustomPermission = {
    ReadCounterparty: new PermissionDefinition({
        name: 'ReadCounterparty',
        description: 'Read counterparty records (scope resolved separately by AccessScopeService)',
    }),
    ReadCounterpartyCredit: new PermissionDefinition({
        name: 'ReadCounterpartyCredit',
        description:
            "Read a counterparty's creditLimit/creditBalance (financial data, layer 4 redaction)",
    }),
    ManageAccessControl: new PermissionDefinition({
        name: 'ManageAccessControl',
        description:
            'Manage role scope configuration (departmentId/branchId, max scope per resource)',
    }),
} as const;
