// No React or @vendure/dashboard imports: this pure logic stays separate per the
// dashboard-extension-rules skill. The real decisions are the missing-value fallbacks.

export const UNASSIGNED_LABEL = 'Unassigned';

// branchId is often empty until upstream populates it; always fall back to "Unassigned"
export function formatBranch(branchId: string | null | undefined): string {
    return branchId && branchId.trim() ? branchId : UNASSIGNED_LABEL;
}

export interface ResolvedErpUserName {
    erpId: string;
    fullName: string | null | undefined;
}

export interface ResolvedAdministratorByErpId {
    erpId: string | null | undefined;
    name: string;
}

// Key on managerErpId only; assignedManagerId is a separate operational owner, not ERP.
// Order: Administrator by customFields.erpId, then unlinked ErpUser fullName, then raw id.
export function formatManager(
    managerErpId: string | null | undefined,
    resolvedAdministrators: ReadonlyArray<ResolvedAdministratorByErpId>,
    resolvedErpUsers: ReadonlyArray<ResolvedErpUserName>,
): string {
    if (!managerErpId) {
        return UNASSIGNED_LABEL;
    }
    const admin = resolvedAdministrators.find(a => a.erpId === managerErpId);
    if (admin) {
        return admin.name;
    }
    const erpUser = resolvedErpUsers.find(u => u.erpId === managerErpId);
    if (erpUser?.fullName) {
        return erpUser.fullName;
    }
    return managerErpId;
}

// Derive Linked/Unlinked from linkedCustomerId, not isActive: ERP-inactive is a separate signal.
export function formatLinkStatus(
    linkedCustomerId: string | null | undefined,
    isActive: boolean,
): 'linked' | 'unlinked' | 'erp-inactive' {
    if (!isActive) {
        return 'erp-inactive';
    }
    return linkedCustomerId ? 'linked' : 'unlinked';
}
