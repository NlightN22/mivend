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

export interface CategoryCrumb {
    id: string;
    name: string;
    slug: string;
}

export interface CategoryPanelData {
    // Ancestors of the current category, root excluded, current excluded — rendered as
    // "go up to this ancestor" links in the sidebar category block.
    ancestors: CategoryCrumb[];
    // The category currently selected via ?collection=slug, if any.
    current?: CategoryCrumb;
    // Direct children of `current` (or, when nothing is selected, the top-level categories).
    children: CategoryCrumb[];
}

// Every Collection returned by the `collections` query already carries its own full
// `breadcrumbs` (root..self) and direct `children` — so the sidebar's "ancestors + current +
// children" panel can be built straight from the flat `items` list without any recursive
// tree-walk or extra query, regardless of how deep the real category actually is.
export function buildCategoryPanel(
    items: RawCollection[],
    currentSlug?: string,
): CategoryPanelData {
    if (!currentSlug) {
        return {
            ancestors: [],
            children: items
                .filter(c => c.breadcrumbs.length === 2)
                .map(c => ({ id: c.id, name: c.name, slug: c.slug })),
        };
    }

    const found = items.find(c => c.slug === currentSlug);
    if (!found) {
        return {
            ancestors: [],
            children: items
                .filter(c => c.breadcrumbs.length === 2)
                .map(c => ({ id: c.id, name: c.name, slug: c.slug })),
        };
    }

    // breadcrumbs = [root, ...ancestors, self] — drop the invisible root and self.
    const ancestors = found.breadcrumbs
        .slice(1, -1)
        .map(c => ({ id: c.id, name: c.name, slug: c.slug }));
    const current = { id: found.id, name: found.name, slug: found.slug };
    const children = (found.children ?? []).map(c => ({ id: c.id, name: c.name, slug: c.slug }));

    return { ancestors, current, children };
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
