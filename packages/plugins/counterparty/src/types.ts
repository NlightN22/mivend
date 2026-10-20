export const loggerCtx = 'CounterpartyPlugin';

export const PORTAL_ROLES = ['client_admin', 'buyer', 'accountant', 'observer'] as const;
export type PortalRole = (typeof PORTAL_ROLES)[number];

// Mirrors the GraphQL `CounterpartySortParameter` input (counterparty.plugin.ts) — only real
// Counterparty columns, see that input's own doc comment for what's deliberately excluded.
export interface CounterpartySortParameter {
    shortName?: 'ASC' | 'DESC' | null;
    inn?: 'ASC' | 'DESC' | null;
    managerErpId?: 'ASC' | 'DESC' | null;
    phone?: 'ASC' | 'DESC' | null;
    officialEmail?: 'ASC' | 'DESC' | null;
}

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
    mainContractId?: string | null;
    // departmentId is the raw ERP id; branchId is written only by BranchAssignmentService.
    departmentId?: string | null;
    // Free-text group/segment label from the ERP — display and filtering only, see
    // Counterparty.erpGroupLabel's doc comment for why this is opaque, not a new hierarchy.
    erpGroupLabel?: string | null;
    phone?: string | null;
    officialEmail?: string | null;
}
