// Pure display-derivation logic for issue #133's Dashboard Counterparty pages — no React/
// @vendure/dashboard imports, per the dashboard-extension-rules skill's "separate pure logic"
// rule. Kept deliberately tiny: the only real decisions this page makes client-side are the
// three "what do we show when the real value is missing/unresolved" fallbacks the issue's
// corrections call out explicitly.

export const UNASSIGNED_LABEL = 'Unassigned';

/**
 * Branch display per issue #133 correction 4: branchId is empty for most rows today (not
 * populated until #65/#123/#124/#125 land) — render the same "Unassigned" fallback the Manager
 * column already used in the concept, never assume it's populated.
 */
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

/**
 * ERP Manager display, per an explicit product decision: this column is entirely about the
 * ERP-side assignment (managerErpId) — never Counterparty.assignedManagerId, which is a
 * different, operational concept (mivend's own current owner, changeable by
 * reassignCounterpartyManager, deliberately independent of whatever 1C last reported) and has no
 * place in resolving this column at all. Resolution is keyed on managerErpId alone, matched
 * against Administrator.customFields.erpId (the unique link UserEnrichmentService writes when an
 * ERP user becomes a real login) — no join through assignedManagerId needed:
 * 1. managerErpId matches a known Administrator's own erpId customField → that Administrator's
 *    current name (more likely up to date than whatever 1C last reported).
 * 2. Otherwise, managerErpId matches an unlinked ErpUser (access-control's own table, populated
 *    straight from 1C's UserChanged stream) → its ERP-reported fullName — a real person mivend
 *    already knows the name of, just not yet a mivend login (#127's three-way resolution). This
 *    is the common case today — a live incident showed a manager with 254 real counterparties
 *    rendering as a raw GUID everywhere before this fallback existed.
 * 3. Neither resolves → the raw managerErpId, so staff can still see *something* 1C sent.
 * No managerErpId at all → the counterparty genuinely has no ERP manager assigned.
 */
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

/**
 * Status column per issue #133: Linked/Unlinked derives from the new linkedCustomerId resolver,
 * not from isActive — ERP-inactive is a separate, orthogonal signal (see the list concept's own
 * "ERP inactive" badge variant), not folded into this same derivation.
 */
export function formatLinkStatus(
    linkedCustomerId: string | null | undefined,
    isActive: boolean,
): 'linked' | 'unlinked' | 'erp-inactive' {
    if (!isActive) {
        return 'erp-inactive';
    }
    return linkedCustomerId ? 'linked' : 'unlinked';
}
