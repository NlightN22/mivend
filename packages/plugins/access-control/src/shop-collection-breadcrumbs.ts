export interface Crumb {
    id: string | number;
}

// Keeps the root (first) and the collection itself (last); drops private ancestors in between.
export function dropPrivateAncestors<T extends Crumb>(crumbs: T[], privateIds: Set<string>): T[] {
    return crumbs.filter(
        (crumb, i) => i === 0 || i === crumbs.length - 1 || !privateIds.has(String(crumb.id)),
    );
}
