export const GROUPING_THRESHOLD = 8;

export interface CatalogEntry {
    title: string;
    description: string;
    area: string;
}

export interface CatalogItem extends CatalogEntry {
    key: string;
}

export interface CatalogGroup<T extends CatalogEntry> {
    area: string;
    operations: T[];
}

export function searchable(operations: CatalogEntry[]): boolean {
    return operations.length > GROUPING_THRESHOLD;
}

export function filterOperations<T extends CatalogEntry>(operations: T[], query: string): T[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return operations;
    return operations.filter(o => `${o.title} ${o.description}`.toLowerCase().includes(needle));
}

// A short list stays flat; past the threshold entries are grouped by area, areas in alphabetical order.
export function groupOperations<T extends CatalogEntry>(operations: T[]): CatalogGroup<T>[] {
    if (!searchable(operations)) return [{ area: '', operations }];
    const byArea = new Map<string, T[]>();
    for (const op of operations) byArea.set(op.area, [...(byArea.get(op.area) ?? []), op]);
    return [...byArea.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([area, list]) => ({ area, operations: list }));
}
