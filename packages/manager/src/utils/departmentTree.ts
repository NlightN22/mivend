import type { DepartmentBranchNode } from '../api/departmentBranch';

export interface DepartmentTreeRow extends DepartmentBranchNode {
    depth: number;
}

// Depth-first order, siblings by name; a node whose parent is missing or cyclic is shown as a root.
export function flattenDepartmentTree(nodes: DepartmentBranchNode[]): DepartmentTreeRow[] {
    const byId = new Map(nodes.map(n => [n.departmentErpId, n]));
    const children = new Map<string | null, DepartmentBranchNode[]>();
    for (const node of nodes) {
        const parent =
            node.parentErpId &&
            byId.has(node.parentErpId) &&
            node.parentErpId !== node.departmentErpId
                ? node.parentErpId
                : null;
        children.set(parent, [...(children.get(parent) ?? []), node]);
    }
    const rows: DepartmentTreeRow[] = [];
    const seen = new Set<string>();
    const visit = (parent: string | null, depth: number): void => {
        const siblings = [...(children.get(parent) ?? [])].sort((a, b) =>
            a.name.localeCompare(b.name),
        );
        for (const node of siblings) {
            if (seen.has(node.departmentErpId)) continue;
            seen.add(node.departmentErpId);
            rows.push({ ...node, depth });
            visit(node.departmentErpId, depth + 1);
        }
    };
    visit(null, 0);
    for (const node of [...nodes].sort((a, b) => a.name.localeCompare(b.name))) {
        if (seen.has(node.departmentErpId)) continue;
        seen.add(node.departmentErpId);
        rows.push({ ...node, depth: 0 });
        visit(node.departmentErpId, 1);
    }
    return rows;
}

export function isUnmappedWithPeople(node: DepartmentBranchNode): boolean {
    return node.effectiveBranchId === null && node.userCount + node.counterpartyCount > 0;
}
