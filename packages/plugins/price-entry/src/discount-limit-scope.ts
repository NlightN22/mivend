import type { ProductAttributes } from 'shared';

export const ALL_PRODUCTS_SCOPE = 'all';

// A limit row's scopeKind selects how a product is matched to its scopeRef; a new product filter is one more entry here.
const SCOPE_REFS: Record<string, (attrs: ProductAttributes) => Iterable<string>> = {
    manufacturer: attrs => (attrs.manufacturerRef ? [attrs.manufacturerRef] : []),
    category: attrs => attrs.categoryRefs,
};

export const LIMIT_SCOPE_KINDS: readonly string[] = [
    ALL_PRODUCTS_SCOPE,
    ...Object.keys(SCOPE_REFS),
];

export function refsByScopeKind(attrs: ProductAttributes | undefined): Map<string, Set<string>> {
    const refs = new Map<string, Set<string>>();
    if (!attrs) return refs;
    for (const [kind, refsOf] of Object.entries(SCOPE_REFS)) refs.set(kind, new Set(refsOf(attrs)));
    return refs;
}
