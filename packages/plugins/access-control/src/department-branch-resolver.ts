export interface ResolvedDepartmentBranch {
    branchId: number;
    sourceDepartmentErpId: string;
}

// Nearest mapped ancestor-or-self wins; the visited set guards against a cyclic parent chain.
export function resolveDepartmentBranch(
    departmentErpId: string | null,
    parentOf: ReadonlyMap<string, string | null>,
    mappingByDepartment: ReadonlyMap<string, number>,
): ResolvedDepartmentBranch | null {
    const visited = new Set<string>();
    let current: string | null = departmentErpId;
    while (current !== null && !visited.has(current)) {
        visited.add(current);
        const branchId = mappingByDepartment.get(current);
        if (branchId !== undefined) return { branchId, sourceDepartmentErpId: current };
        current = parentOf.get(current) ?? null;
    }
    return null;
}

export function subtreeOf(
    rootErpId: string,
    parentOf: ReadonlyMap<string, string | null>,
): Set<string> {
    const children = new Map<string, string[]>();
    for (const [id, parent] of parentOf) {
        if (parent === null) continue;
        children.set(parent, [...(children.get(parent) ?? []), id]);
    }
    const result = new Set<string>([rootErpId]);
    const queue = [rootErpId];
    while (queue.length > 0) {
        for (const child of children.get(queue.shift() as string) ?? []) {
            if (!result.has(child)) {
                result.add(child);
                queue.push(child);
            }
        }
    }
    return result;
}

export interface CounterpartyBranchSignals {
    override: string | null;
    managerDepartmentErpId: string | null;
    ownDepartmentErpId: string | null;
}

// Order: manual override, the manager's department, the counterparty's own department; else null.
export function resolveCounterpartyBranch(
    signals: CounterpartyBranchSignals,
    parentOf: ReadonlyMap<string, string | null>,
    mappingByDepartment: ReadonlyMap<string, number>,
): string | null {
    if (signals.override) return signals.override;
    for (const department of [signals.managerDepartmentErpId, signals.ownDepartmentErpId]) {
        const resolved = resolveDepartmentBranch(department, parentOf, mappingByDepartment);
        if (resolved) return String(resolved.branchId);
    }
    return null;
}
