export interface CollectionNode {
    id: string;
    name: string;
    slug: string;
    children: CollectionNode[];
}

export interface RawCollection {
    id: string;
    name: string;
    slug: string;
    breadcrumbs: { id: string; name: string; slug: string }[];
    children: { id: string; name: string; slug: string }[];
}

// A Collection's `breadcrumbs` always includes the invisible root collection, so
// breadcrumbs.length === 2 means "root + self" — i.e. top-level. Shop API and Admin API expose
// the identical `collections` query shape, so this shaping logic is shared between the
// storefront's catalog mega-menu and the manager portal's catalog category dropdown.
export function buildCategoryTree(items: RawCollection[]): CollectionNode[] {
    return items
        .filter(c => c.breadcrumbs.length === 2)
        .map(c => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            children: (c.children ?? []).map(child => ({ ...child, children: [] })),
        }));
}

interface FacetGroupLike {
    code: string;
    values: { id: string; code: string }[];
}

// Collections and the 'category' facet share codes by naming convention in this dataset (a
// Collection slug like "cat-cat-engine-oils" carries the same "cat-engine-oils" facet code,
// just with an extra "cat-" prefix from the erp-import seed data) — not a structural guarantee,
// but the established pattern this codebase already relies on for category-dropdown navigation.
export function resolveCategoryFacetValueId(
    collectionSlug: string,
    facetGroups: FacetGroupLike[],
): string | undefined {
    const code = collectionSlug.startsWith('cat-') ? collectionSlug.slice(4) : collectionSlug;
    const catGroup = facetGroups.find(g => g.code === 'category');
    return catGroup?.values.find(v => v.code === code)?.id;
}
