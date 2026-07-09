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
    AdjustPriceWithinLimit: new PermissionDefinition({
        name: 'AdjustPriceWithinLimit',
        description:
            'Adjust an order line price directly, as long as it stays at/above the floor price (layer 5 gate)',
    }),
    ReadFloorPrice: new PermissionDefinition({
        name: 'ReadFloorPrice',
        description:
            'Read the raw floor-price threshold for a variant (financial data, layer 4 redaction)',
    }),
    RequestPriceAdjustmentApproval: new PermissionDefinition({
        name: 'RequestPriceAdjustmentApproval',
        description: 'Create a one-off price adjustment approval request (layer 5)',
    }),
    RequestDiscountGrantApproval: new PermissionDefinition({
        name: 'RequestDiscountGrantApproval',
        description: 'Create/renew a standing discount grant approval request (layer 5)',
    }),
    RequestCreditTermApproval: new PermissionDefinition({
        name: 'RequestCreditTermApproval',
        description: 'Create a credit-term approval request (layer 5)',
    }),
    ApproveDiscountRequest: new PermissionDefinition({
        name: 'ApproveDiscountRequest',
        description:
            'Decide a step of a priceAdjustmentApproval or discountGrantApproval chain (layer 5)',
    }),
    ApproveSecurityLimit: new PermissionDefinition({
        name: 'ApproveSecurityLimit',
        description: 'Decide a step of a securityLimitApproval chain (layer 5)',
    }),
    ManageApprovalWorkflows: new PermissionDefinition({
        name: 'ManageApprovalWorkflows',
        description: 'Create/edit WorkflowDefinition chains (layer 5, /settings)',
    }),
} as const;
