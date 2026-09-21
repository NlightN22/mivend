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
    // departmentId is the ERP's own id (Department.erpId) — pure 1C org-structure data, display/
    // informational, mirrored as-is (see docs/access-control.md's "Branch vs Department" note).
    //
    // branchId is NOT an ERP id despite the stale convention this comment used to describe —
    // Branch is mivend's own entity, and every real consumer of `branchId` (AccessScopeService,
    // BranchSettingsService, Warehouse.branchId) expects a resolved mivend `Branch.id`, never a
    // raw ERP-sourced value. No caller sets this field today (see CounterpartyHandler.upsert's
    // own comment) — issue #65 ("Counterparty→Branch auto-assignment worker") is the intended
    // single place that will ever populate it, and must resolve to `Branch.id` when it does,
    // mirroring WarehouseService.upsert's pattern — never pass an ERP id through raw again.
    departmentId?: string | null;
    branchId?: string | null;
    // Free-text group/segment label from the ERP — display and filtering only, see
    // Counterparty.erpGroupLabel's doc comment for why this is opaque, not a new hierarchy.
    erpGroupLabel?: string | null;
}
