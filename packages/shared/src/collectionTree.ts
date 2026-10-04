export interface CollectionNode {
    id: string;
    name: string;
    slug: string;
    iconUrl?: string | null;
    // Set only for private collections (manager sees them); absent means visible.
    isHidden?: boolean;
    children: CollectionNode[];
}

export interface RawCollection {
    id: string;
    name: string;
    slug: string;
    breadcrumbs: { id: string; name: string; slug: string }[];
    featuredAsset?: { preview: string } | null;
    isPrivate?: boolean;
}

export const COLLECTIONS_PAGE_SIZE = 100;

export async function fetchAllCollections<T>(
    fetchPage: (skip: number, take: number) => Promise<{ items: T[]; totalItems: number }>,
): Promise<T[]> {
    const first = await fetchPage(0, COLLECTIONS_PAGE_SIZE);
    if (first.items.length === 0 || first.items.length >= first.totalItems) return first.items;
    const skips: number[] = [];
    for (let skip = first.items.length; skip < first.totalItems; skip += COLLECTIONS_PAGE_SIZE)
        skips.push(skip);
    const rest = await Promise.all(skips.map(skip => fetchPage(skip, COLLECTIONS_PAGE_SIZE)));
    return [...first.items, ...rest.flatMap(page => page.items)];
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
            ...(c.isPrivate ? { isHidden: true } : {}),
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
    isHidden?: boolean;
}

export const MAX_PANEL_ANCESTORS = 2;

export interface CategoryPanelData {
    current?: CategoryCrumb;
    // Up to the 2 nearest ancestors, outermost first.
    ancestors: CategoryCrumb[];
    // `current`'s children when it has any, otherwise its siblings including `current`;
    // the top-level list when nothing is selected.
    level: CategoryCrumb[];
    levelIsChildren: boolean;
}

const toCrumb = (n: CollectionNode): CategoryCrumb => ({
    id: n.id,
    name: n.name,
    slug: n.slug,
    ...(n.isHidden ? { isHidden: true } : {}),
});

export function buildCategoryPanel(
    tree: CollectionNode[],
    currentSlug?: string,
): CategoryPanelData {
    const path = currentSlug ? findCategoryPath(tree, currentSlug) : [];
    const current = path[path.length - 1];
    if (!current) return { ancestors: [], level: tree.map(toCrumb), levelIsChildren: false };

    const parent = path[path.length - 2];
    const hasChildren = current.children.length > 0;
    return {
        current: toCrumb(current),
        ancestors: path.slice(-1 - MAX_PANEL_ANCESTORS, -1).map(toCrumb),
        level: (hasChildren ? current.children : parent ? parent.children : tree).map(toCrumb),
        levelIsChildren: hasChildren,
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
