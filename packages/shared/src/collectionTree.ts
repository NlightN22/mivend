export interface CollectionNode {
    id: string;
    name: string;
    slug: string;
    iconUrl?: string | null;
    children: CollectionNode[];
}

export interface RawCollection {
    id: string;
    name: string;
    slug: string;
    breadcrumbs: { id: string; name: string; slug: string }[];
    featuredAsset?: { preview: string } | null;
}

export const COLLECTIONS_PAGE_SIZE = 100;

export async function fetchAllCollections<T>(
    fetchPage: (skip: number, take: number) => Promise<{ items: T[]; totalItems: number }>,
): Promise<T[]> {
    const all: T[] = [];
    for (;;) {
        const page = await fetchPage(all.length, COLLECTIONS_PAGE_SIZE);
        all.push(...page.items);
        if (page.items.length === 0 || all.length >= page.totalItems) return all;
    }
}

// `breadcrumbs` is root..self including the invisible root. A node attaches to its nearest
// ancestor present in `items`; one with none (hidden ancestors) becomes top level.
export function buildCategoryTree(items: RawCollection[]): CollectionNode[] {
    const nodes = new Map<string, CollectionNode>();
    for (const c of items) {
        nodes.set(c.id, {
            id: c.id,
            name: c.name,
            slug: c.slug,
            iconUrl: c.featuredAsset?.preview ?? null,
            children: [],
        });
    }

    const roots: CollectionNode[] = [];
    for (const c of items) {
        const node = nodes.get(c.id) as CollectionNode;
        const ancestors = c.breadcrumbs.slice(1, -1);
        const parent = [...ancestors].reverse().find(a => nodes.has(a.id));
        if (parent) (nodes.get(parent.id) as CollectionNode).children.push(node);
        else roots.push(node);
    }
    return roots;
}

// Root..self, only nodes present in the tree; empty when the slug is unknown.
export function findCategoryPath(tree: CollectionNode[], slug: string): CollectionNode[] {
    for (const node of tree) {
        if (node.slug === slug) return [node];
        const rest = findCategoryPath(node.children, slug);
        if (rest.length > 0) return [node, ...rest];
    }
    return [];
}

export function filterVisibleCrumbs<T extends { id: string }>(
    breadcrumbs: T[],
    tree: CollectionNode[],
): T[] {
    const ids = new Set<string>();
    const walk = (nodes: CollectionNode[]): void =>
        nodes.forEach(n => {
            ids.add(n.id);
            walk(n.children);
        });
    walk(tree);
    return breadcrumbs.filter(c => ids.has(c.id));
}

export interface CategoryCrumb {
    id: string;
    name: string;
    slug: string;
}

export interface CategoryPanelData {
    current?: CategoryCrumb;
    // Same-level categories including `current`; empty when nothing is selected.
    siblings: CategoryCrumb[];
    // Direct children of `current`, or the top-level categories when nothing is selected.
    children: CategoryCrumb[];
}

const toCrumb = (n: CollectionNode): CategoryCrumb => ({ id: n.id, name: n.name, slug: n.slug });

export function buildCategoryPanel(
    tree: CollectionNode[],
    currentSlug?: string,
): CategoryPanelData {
    const path = currentSlug ? findCategoryPath(tree, currentSlug) : [];
    const current = path[path.length - 1];
    if (!current) return { siblings: [], children: tree.map(toCrumb) };

    const parent = path[path.length - 2];
    return {
        current: toCrumb(current),
        siblings: (parent ? parent.children : tree).map(toCrumb),
        children: current.children.map(toCrumb),
    };
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
