export interface TreeSource {
    id: string;
    name: string;
    breadcrumbs?: { id: string }[] | null;
}

export interface CategoryTreeRow<T extends TreeSource> {
    item: T;
    depth: number;
    hasChildren: boolean;
    expanded: boolean;
}

// Breadcrumbs are root..self including the invisible root; a node with no loaded ancestor is a root.
function parentIdOf(item: TreeSource, known: Set<string>): string | null {
    const ancestors = (item.breadcrumbs ?? []).slice(1, -1);
    const parent = [...ancestors].reverse().find(a => known.has(a.id));
    return parent?.id ?? null;
}

// A name match reveals its ancestors; while searching, matched branches are expanded.
export function buildCategoryTreeRows<T extends TreeSource>(
    items: T[],
    expandedIds: ReadonlySet<string>,
    term: string,
): CategoryTreeRow<T>[] {
    const known = new Set(items.map(i => i.id));
    const parents = new Map<string, string | null>();
    const children = new Map<string | null, T[]>();
    for (const item of items) {
        const parent = parentIdOf(item, known);
        parents.set(item.id, parent);
        children.set(parent, [...(children.get(parent) ?? []), item]);
    }

    const needle = term.trim().toLowerCase();
    const shown = new Set<string>();
    const forcedOpen = new Set<string>();
    if (needle) {
        for (const item of items) {
            if (!item.name.toLowerCase().includes(needle)) continue;
            shown.add(item.id);
            for (let p = parents.get(item.id); p; p = parents.get(p)) {
                shown.add(p);
                forcedOpen.add(p);
            }
        }
    }

    const rows: CategoryTreeRow<T>[] = [];
    const visit = (parent: string | null, depth: number): void => {
        for (const item of children.get(parent) ?? []) {
            if (needle && !shown.has(item.id)) continue;
            const kids = (children.get(item.id) ?? []).filter(k => !needle || shown.has(k.id));
            const expanded = needle ? forcedOpen.has(item.id) : expandedIds.has(item.id);
            rows.push({ item, depth, hasChildren: kids.length > 0, expanded });
            if (expanded) visit(item.id, depth + 1);
        }
    };
    visit(null, 0);
    return rows;
}

export function parentIdsWithChildren(items: TreeSource[]): string[] {
    const known = new Set(items.map(i => i.id));
    return [...new Set(items.map(i => parentIdOf(i, known)).filter((p): p is string => !!p))];
}
