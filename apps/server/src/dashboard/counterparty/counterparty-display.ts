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

export interface ManagerLookup {
    assignedManagerId: string | null | undefined;
    managerErpId: string | null | undefined;
}

export interface ResolvedManagerName {
    id: string;
    name: string;
}

/**
 * Manager display per issue #133 correction 3: managerErpId is a fallback only. When
 * assignedManagerId resolves to a known Administrator, show that Administrator's name. When it
 * doesn't (unlinked/pending, see #127's three-way resolution), fall back to the raw
 * managerErpId so staff can see what 1C sent even before/if it ever resolves. If neither is
 * present, the counterparty genuinely has no manager assigned.
 */
export function formatManager(
    counterparty: ManagerLookup,
    resolvedAdministrators: ReadonlyArray<ResolvedManagerName>,
): string {
    const { assignedManagerId, managerErpId } = counterparty;
    if (assignedManagerId) {
        const resolved = resolvedAdministrators.find(a => a.id === assignedManagerId);
        if (resolved) {
            return resolved.name;
        }
    }
    if (managerErpId) {
        return managerErpId;
    }
    return UNASSIGNED_LABEL;
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
