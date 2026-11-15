export interface ManagerList {
    managerId: string | null;
    managerIds: string[];
    // Administrators the ERP cannot be told about because they have no ERP user link.
    unlinkedAdministratorIds: string[];
}

// Owner first, then the other team members; roles stay portal-only. A duplicate or an administrator without an ERP user link is left out.
export function buildManagerList(
    ownerAdministratorId: string | null,
    teamAdministratorIds: readonly string[],
    erpIdByAdministrator: ReadonlyMap<string, string>,
): ManagerList {
    const ordered = [
        ...new Set([
            ...(ownerAdministratorId ? [ownerAdministratorId] : []),
            ...teamAdministratorIds,
        ]),
    ];
    const managerIds: string[] = [];
    const unlinkedAdministratorIds: string[] = [];
    for (const administratorId of ordered) {
        const erpId = erpIdByAdministrator.get(administratorId);
        if (erpId) managerIds.push(erpId);
        else unlinkedAdministratorIds.push(administratorId);
    }
    const ownerErpId = ownerAdministratorId ? erpIdByAdministrator.get(ownerAdministratorId) : null;
    return { managerId: ownerErpId ?? null, managerIds, unlinkedAdministratorIds };
}
