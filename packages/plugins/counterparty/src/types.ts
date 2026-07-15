export const loggerCtx = 'CounterpartyPlugin';

export const PORTAL_ROLES = ['client_admin', 'buyer', 'accountant', 'observer'] as const;
export type PortalRole = (typeof PORTAL_ROLES)[number];

export interface CounterpartyUpsertPayload {
    erpId: string;
    legalName: string;
    shortName: string;
    inn?: string | null;
    creditLimit: number;
    creditBalance: number;
    paymentDelayDays: number;
    priceType: string;
    isActive: boolean;
    // ERP ids (Department.erpId / Branch.erpId), same convention as
    // Administrator.customFields.departmentId/branchId — see AccessScopeService, which compares
    // these against the caller's own ERP-id-valued department/branch to resolve 'department'
    // scope visibility.
    departmentId?: string | null;
    branchId?: string | null;
    // Free-text group/segment label from the ERP — display and filtering only, see
    // Counterparty.erpGroupLabel's doc comment for why this is opaque, not a new hierarchy.
    erpGroupLabel?: string | null;
}
