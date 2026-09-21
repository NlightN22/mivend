import type { AccessScopeConfig } from './role-scope-config.service';

export interface DefaultRoleDefinition {
    code: string;
    description: string;
    permissions: string[];
    accessScopeConfig: AccessScopeConfig;
}

// Single source of truth for the 6 manager-portal roles — hardcoded here (per AGENTS.md's
// "Do not hardcode business enums" rule this is RBAC configuration, not business data) and
// self-provisioned at server bootstrap by RoleProvisioningService. Previously only lived in
// infrastructure/scripts/seed-access-roles.mjs (a manual dev script) — see issue #134. Role ->
// max-scope-per-resource matches the persona matrix in docs/ai/manager-portal-concept.md
// §2/§3.3. Every role must set both "counterparty" and "order" keys — a resource missing a key
// silently falls back to 'own' (RoleScopeConfigService.maxScopeFor's default).
export const DEFAULT_ROLES: DefaultRoleDefinition[] = [
    {
        code: 'operator',
        description: 'Operator — processes current orders, all customers in own department/branch',
        permissions: [
            'ReadCatalog',
            'ReadOrder',
            'ReadInvoice',
            'ReadPayment',
            'CreateOrder',
            'UpdateOrder',
            'ConfirmOrder',
            'ReadCustomer',
            'ReadCounterparty',
        ],
        accessScopeConfig: {
            counterparty: 'department',
            order: 'department',
            invoice: 'department',
        },
    },
    {
        code: 'manager',
        description:
            'Manager — owns an assigned customer book, must request approval for adjustments',
        permissions: [
            'ReadCatalog',
            'ReadOrder',
            'ReadInvoice',
            'ReadPayment',
            'CreateOrder',
            'UpdateOrder',
            'ConfirmOrder',
            'ReadCustomer',
            'ReadCounterparty',
            'AdjustPriceWithinLimit',
            'RequestPriceAdjustmentApproval',
            'RequestDiscountGrantApproval',
            'RequestCreditTermApproval',
        ],
        accessScopeConfig: { counterparty: 'own', order: 'own', invoice: 'own' },
    },
    {
        code: 'department-head',
        description:
            'Department head — approves requests for their department, sees department-wide data',
        permissions: [
            'ReadCatalog',
            'ReadOrder',
            'ReadInvoice',
            'ReadPayment',
            'ReadCustomer',
            'ReadCounterparty',
            'ReadFloorPrice',
            'ApproveDiscountRequest',
            'ReassignCounterpartyManager',
            'ManageCounterpartyTeam',
            'ReadEntityHistory',
        ],
        accessScopeConfig: {
            counterparty: 'department',
            order: 'department',
            invoice: 'department',
        },
    },
    {
        code: 'general-director',
        description: 'General director — final approval step, full company-wide visibility',
        permissions: [
            'ReadCatalog',
            'ReadOrder',
            'ReadInvoice',
            'ReadPayment',
            'ReadCustomer',
            'ReadCounterparty',
            'ReadCounterpartyCredit',
            'ReadFloorPrice',
            'ApproveDiscountRequest',
            'ReadEntityHistory',
            'ManageAccessControl',
            'ManageAdministratorLifecycle',
            'ReadAdministrator',
            'UpdateAdministrator',
            'CreateOrder',
            'UpdateOrder',
            'ConfirmOrder',
            'AdjustPriceWithinLimit',
            'RequestPriceAdjustmentApproval',
            'RequestDiscountGrantApproval',
            'RequestCreditTermApproval',
            'ApproveSecurityLimit',
            'ManageApprovalWorkflows',
            'ReassignCounterpartyManager',
            'ManageCounterpartyTeam',
        ],
        accessScopeConfig: {
            counterparty: 'all',
            order: 'all',
            teamVisibility: 'all',
            invoice: 'all',
        },
    },
    {
        code: 'security-officer',
        description: 'Security officer — company-wide read visibility for credit-limit escalations',
        permissions: [
            'ReadCatalog',
            'ReadOrder',
            'ReadInvoice',
            'ReadPayment',
            'ReadCustomer',
            'ReadCounterparty',
            'ReadCounterpartyCredit',
            'ReadFloorPrice',
            'ApproveSecurityLimit',
            'ReadEntityHistory',
        ],
        accessScopeConfig: {
            counterparty: 'all',
            order: 'all',
            teamVisibility: 'all',
            invoice: 'all',
        },
    },
    {
        code: 'portal-admin',
        description:
            'Portal administrator — manages roles, permissions and (later) approval workflows',
        permissions: [
            'ReadCatalog',
            'ReadOrder',
            'ReadInvoice',
            'ReadPayment',
            'ReadCustomer',
            'ReadCounterparty',
            'ReadCounterpartyCredit',
            'ReadFloorPrice',
            'ManageAccessControl',
            'ManageAdministratorLifecycle',
            'ManageApprovalWorkflows',
            'ReassignCounterpartyManager',
            'ManageCounterpartyTeam',
            'ReadEntityHistory',
            'ReadAdministrator',
            'UpdateAdministrator',
            'CreateOrder',
            'UpdateOrder',
            'ConfirmOrder',
            'AdjustPriceWithinLimit',
            'RequestPriceAdjustmentApproval',
            'RequestDiscountGrantApproval',
            'RequestCreditTermApproval',
            'ApproveDiscountRequest',
            'ApproveSecurityLimit',
            'ReadSettings',
            'UpdateCatalog',
        ],
        accessScopeConfig: {
            counterparty: 'all',
            order: 'all',
            teamVisibility: 'all',
            invoice: 'all',
        },
    },
];
