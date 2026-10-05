import { findCategoryPath, type CollectionNode } from '../../../shared/src/collectionTree';

export interface SearchLocation {
    path: string;
    query: Record<string, string>;
}

export function buildSearchLocation(
    term: string,
    collectionSlug: string | undefined,
): SearchLocation {
    const query: Record<string, string> = {};
    if (term) query.q = term;
    if (collectionSlug) query.collection = collectionSlug;
    return { path: '/catalog', query };
}

export function resolveScopeLabel(
    collections: CollectionNode[],
    slug: string | undefined,
): string | undefined {
    if (!slug) return undefined;
    return findCategoryPath(collections, slug).at(-1)?.name;
}
