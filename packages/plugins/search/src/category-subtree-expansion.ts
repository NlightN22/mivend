export interface CategoryNodeRow {
    collectionId: number | string;
    parentId: number | string | null;
    isPrivate: boolean;
    facetValueId: number | string | null;
}

interface FacetValueFilter {
    and?: string | number | null;
    or?: Array<string | number> | null;
}

// Facet value ids of the category's visible descendants; a hidden node cuts off its whole
// subtree, and a node without a facet value yet (placeholder) is passed through.
export function visibleSubtreeFacetValueIds(
    rows: CategoryNodeRow[],
): (categoryFacetValueId: string) => string[] {
    const seenRows = new Set<string>();
    const children = new Map<string, CategoryNodeRow[]>();
    const owner = new Map<string, CategoryNodeRow>();
    for (const row of rows) {
        const id = String(row.collectionId);
        if (seenRows.has(id)) continue;
        seenRows.add(id);
        if (row.facetValueId !== null) owner.set(String(row.facetValueId), row);
        if (row.parentId === null) continue;
        const siblings = children.get(String(row.parentId)) ?? [];
        siblings.push(row);
        children.set(String(row.parentId), siblings);
    }
    return facetValueId => {
        const start = owner.get(facetValueId);
        if (!start || start.isPrivate) return [];
        const found: string[] = [];
        const visited = new Set<string>();
        const stack = [...(children.get(String(start.collectionId)) ?? [])];
        for (let node = stack.pop(); node; node = stack.pop()) {
            const id = String(node.collectionId);
            if (visited.has(id) || node.isPrivate) continue;
            visited.add(id);
            if (node.facetValueId !== null) found.push(String(node.facetValueId));
            stack.push(...(children.get(id) ?? []));
        }
        return found;
    };
}

// A lone `and` on a category becomes an `or` over the subtree; a product matches through any visible descendant.
export function expandCategoryFilters<F extends FacetValueFilter>(
    filters: F[],
    descendantsOf: (categoryFacetValueId: string) => string[],
): F[] {
    const widen = (ids: Array<string | number>): Array<string | number> => [
        ...new Set([...ids, ...ids.flatMap(id => descendantsOf(String(id)))]),
    ];
    return filters.map(filter => {
        // A filter holding both `and` and a non-empty `or` widens only its `or`: the storefront never sends that shape.
        const hasAnd = filter.and !== undefined && filter.and !== null;
        const own =
            hasAnd && !filter.or?.length ? [filter.and as string | number] : (filter.or ?? []);
        const wide = widen(own);
        if (wide.length === own.length) return filter;
        return hasAnd && !filter.or?.length
            ? { ...filter, and: undefined, or: wide }
            : { ...filter, or: wide };
    });
}
