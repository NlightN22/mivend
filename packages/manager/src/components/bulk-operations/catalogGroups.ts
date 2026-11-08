import type { BulkOperationInfo } from '../../api/bulkOperations';

export const GROUPING_THRESHOLD = 8;

export interface CatalogGroup {
    area: string;
    operations: BulkOperationInfo[];
}

export function searchable(operations: BulkOperationInfo[]): boolean {
    return operations.length > GROUPING_THRESHOLD;
}

export function filterOperations(
    operations: BulkOperationInfo[],
    query: string,
): BulkOperationInfo[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return operations;
    return operations.filter(o => `${o.title} ${o.description}`.toLowerCase().includes(needle));
}

// A short list stays flat; past the threshold operations are grouped by area, areas in alphabetical order.
export function groupOperations(operations: BulkOperationInfo[]): CatalogGroup[] {
    if (!searchable(operations)) return [{ area: '', operations }];
    const byArea = new Map<string, BulkOperationInfo[]>();
    for (const op of operations) byArea.set(op.area, [...(byArea.get(op.area) ?? []), op]);
    return [...byArea.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([area, list]) => ({ area, operations: list }));
}
