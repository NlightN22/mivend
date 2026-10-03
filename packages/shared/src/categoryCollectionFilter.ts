export const CATEGORY_FACET_CODE = 'category';
export const CATEGORY_SLUG_PREFIX = 'cat-';

export interface CategoryFilterOperation {
    code: string;
    arguments: Array<{ name: string; value: string }>;
}

export interface CategoryCollectionNode {
    id: string;
    parentId: string | null;
    slug: string;
    filterFacetValueIds: string[];
}

export interface CategoryVisibilityNode {
    id: string;
    parentId: string | null;
    slug: string;
    feedHidden: boolean;
    visibilityOverride: string | null;
    isPrivate: boolean;
}

export interface CategoryVisibilityUpdate {
    id: string;
    isPrivate: boolean;
}

export interface CategoryFilterUpdate {
    id: string;
    facetValueIds: string[];
}

export function categorySlug(erpId: string): string {
    return `${CATEGORY_SLUG_PREFIX}${erpId}`;
}

export function categoryErpIdFromSlug(slug: string): string | undefined {
    return slug.startsWith(CATEGORY_SLUG_PREFIX)
        ? slug.slice(CATEGORY_SLUG_PREFIX.length)
        : undefined;
}

// containsAny: a parent category lists products of its whole subtree (Vendure's inheritFilters
// ANDs parent and child filters instead, so it cannot widen a parent).
export function buildCategoryFacetFilter(facetValueIds: string[]): CategoryFilterOperation[] {
    return [
        {
            code: 'facet-value-filter',
            arguments: [
                { name: 'facetValueIds', value: JSON.stringify(facetValueIds) },
                { name: 'containsAny', value: 'true' },
            ],
        },
    ];
}

// Reads the stored entity shape (`args`), not the GraphQL input shape (`arguments`).
export function parseFacetValueIds(
    filters: Array<{ code: string; args: Array<{ name: string; value: string }> }>,
): string[] {
    const arg = filters
        .find(f => f.code === 'facet-value-filter')
        ?.args.find(a => a.name === 'facetValueIds');
    if (!arg) return [];
    try {
        const parsed: unknown = JSON.parse(arg.value);
        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
        return [];
    }
}

function sortedUnique(ids: string[]): string[] {
    return [...new Set(ids)].sort();
}

// Descendants without a FacetValue yet (placeholder parents' children seen before their own
// event) contribute nothing; the periodic recompute picks them up once they exist.
export function collectFacetValueIds(
    ownFacetValueId: string,
    descendantSlugs: string[],
    facetValueIdByCode: ReadonlyMap<string, string>,
): string[] {
    const ids = [ownFacetValueId];
    for (const slug of descendantSlugs) {
        const code = categoryErpIdFromSlug(slug);
        const id = code === undefined ? undefined : facetValueIdByCode.get(code);
        if (id !== undefined) ids.push(id);
    }
    return sortedUnique(ids);
}

export function planCategoryFilterUpdates(
    nodes: CategoryCollectionNode[],
    facetValueIdByCode: ReadonlyMap<string, string>,
): CategoryFilterUpdate[] {
    const childrenByParent = new Map<string, CategoryCollectionNode[]>();
    for (const node of nodes) {
        if (node.parentId === null) continue;
        const siblings = childrenByParent.get(node.parentId) ?? [];
        siblings.push(node);
        childrenByParent.set(node.parentId, siblings);
    }

    const result: CategoryFilterUpdate[] = [];
    for (const node of nodes) {
        const code = categoryErpIdFromSlug(node.slug);
        const own = code === undefined ? undefined : facetValueIdByCode.get(code);
        if (own === undefined) continue;

        const descendantSlugs: string[] = [];
        const visited = new Set<string>([node.id]);
        const stack = [...(childrenByParent.get(node.id) ?? [])];
        while (stack.length > 0) {
            const next = stack.pop()!;
            if (visited.has(next.id)) continue;
            visited.add(next.id);
            descendantSlugs.push(next.slug);
            stack.push(...(childrenByParent.get(next.id) ?? []));
        }

        const wanted = collectFacetValueIds(own, descendantSlugs, facetValueIdByCode);
        const current = sortedUnique(node.filterFacetValueIds);
        if (wanted.join(',') !== current.join(',')) {
            result.push({ id: node.id, facetValueIds: wanted });
        }
    }
    return result;
}

// A manual override wins over everything; otherwise a category is hidden when the feed hides it
// or any ancestor is hidden, so children vanish together with a deleted/not-yet-synced parent.
export function resolveCategoryIsPrivate(
    feedHidden: boolean,
    visibilityOverride: string | null | undefined,
    parentIsPrivate: boolean,
): boolean {
    if (visibilityOverride === 'hidden') return true;
    if (visibilityOverride === 'visible') return false;
    return feedHidden || parentIsPrivate;
}

export function planCategoryVisibilityUpdates(
    nodes: CategoryVisibilityNode[],
): CategoryVisibilityUpdate[] {
    const byId = new Map(nodes.map(n => [n.id, n]));
    const resolved = new Map<string, boolean>();

    const effective = (node: CategoryVisibilityNode, path: Set<string>): boolean => {
        const cached = resolved.get(node.id);
        if (cached !== undefined) return cached;
        const parent = node.parentId === null ? undefined : byId.get(node.parentId);
        const isCategoryParent =
            parent !== undefined &&
            categoryErpIdFromSlug(parent.slug) !== undefined &&
            !path.has(parent.id);
        const parentIsPrivate = isCategoryParent
            ? effective(parent, new Set(path).add(node.id))
            : false;
        const value = resolveCategoryIsPrivate(
            node.feedHidden,
            node.visibilityOverride,
            parentIsPrivate,
        );
        resolved.set(node.id, value);
        return value;
    };

    const updates: CategoryVisibilityUpdate[] = [];
    for (const node of nodes) {
        if (categoryErpIdFromSlug(node.slug) === undefined) continue;
        const wanted = effective(node, new Set([node.id]));
        if (wanted !== node.isPrivate) updates.push({ id: node.id, isPrivate: wanted });
    }
    return updates;
}
